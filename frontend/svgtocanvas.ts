import VDom from "../util/vdom";
import CanvasWorkerMessage from "../util/canvas-worker-message"
import Elementhandler from "./elementhandler";

export default class SvgToCanvas {
    
    private unassignedNodes: Node[] = [];
    private worker: Worker = new Worker('dist/canvasworker.js');
    private elementHandler: Elementhandler;
    private vdom: VDom;
    private setSize = false;
    private interactionSelections: HTMLElement[] = [];
    
    constructor(private canvas: HTMLCanvasElement, private svg: SVGElement) {
        this.captureD3On();
        
        this.elementHandler = new Elementhandler(this.svg, (data: any) => {
            this.sendToWorker({
                cmd: 'UPDATE_NODES',
                data: data,
            });
        });
        this.vdom = this.elementHandler.getVDom();
    
        this.setCanvasSize();
        const offscreen = (this.canvas as any).transferControlToOffscreen();
        this.sendToWorker({cmd: 'INIT', data: {
                canvas: offscreen,
                visData: this.vdom.data
            }
        }, [offscreen]);
        
        canvas.addEventListener('mousedown', e => this.propagateMouseEvent(e));
        canvas.addEventListener('mousemove', e => this.propagateMouseEvent(e));
        canvas.addEventListener('mouseup', e => this.propagateMouseEvent(e));
        canvas.addEventListener('wheel', e => this.propagateWheelEvent(e));

        this.replaceNativeAttribute();
        this.replaceNativeCreateElement();
        this.replaceNativeAppend();
        this.replaceD3Attr();
    }
    
    private setCanvasSize() {
        this.vdom.data.scale = window.devicePixelRatio;
    
        this.canvas.style.width = this.vdom.data.width + 'px';
        this.canvas.style.height = this.vdom.data.height + 'px';
        this.canvas.width = this.vdom.data.width * this.vdom.data.scale;
        this.canvas.height = this.vdom.data.height * this.vdom.data.scale;
    
        this.setSize = true;
    }
    
    private captureD3On() {
        console.log('trying to capture "on"');
        if((window as any)['d3']) {
            const d3 = (window as any)['d3'];
            const originalOn = d3.selection.prototype.on;
            const me = this;
    
            d3.selection.prototype.on = function()
            {
                const el = this._parents && this._parents.length ? this._parents[0] : null;
                
                if(el && me.interactionSelections.indexOf(el) === -1)
                {
                    me.interactionSelections.push(el); // This one works for native get/setAttribute
                    //interactionSelections.push(this); // This one works for d3 .attr.
                }
        
                return originalOn.apply(this, arguments);
            };
        }
    }
    
    private replaceD3Attr() {

        const me = this;

        function getReplacement(originalFct) {
            return function(name, value) {
                //console.log(this, arguments);
                if(!value) {
    
                    if(me.unassignedNodes.indexOf(this) !== -1) {
                        return originalFct.apply(this, arguments);
                    } else {
                        return me.elementHandler.getAttributesFromSelector(this, name);
                    }
                } else {
                    if(name === 'class') {
                        return originalFct.apply(this, arguments);
                    }
                    me.elementHandler.queueSetAttributeOnSelection(this, name, value);
                
                    return this;
                }
            };
        }
    
        if((window as any)['d3']) {
            const d3 = (window as any)['d3'];
    
            let origSelectionAttr = d3.selection.prototype.attr;
            d3.selection.prototype.attr = getReplacement(origSelectionAttr);
        }
    }
    
    private replaceNativeCreateElement() {
        const origCreate = document.createElementNS;
        const me = this;
        
        document.createElementNS = function() {
            let newArgs = Array.from(arguments);
            const el = origCreate.apply(this, newArgs);
            
            el.appendChild = () => {
                console.log('hi!!', el, arguments);
            };
            
            me.unassignedNodes.push(el);
    
            //console.log(me.unassignedNodes);
            
            return el;
        }
    }
    
    private replaceNativeAppend() {
        const origAppendChild = Element.prototype.appendChild;
        const me = this;
        
        const newAppend = function<T extends Node>(this: Element, el: T) {
    
            el['appendChild'] = <T extends Node>(el2: T) => {
                return el2;
            };
            const parentSelector = me.elementHandler.getElementSelector(this);
            (el as any)['parentSelector'] = parentSelector;
            
            const selector = me.elementHandler.getElementSelector(<Element><any> el);
            const parentNode = me.vdom.getVisNodeFromSelector(parentSelector);
            //console.log(this, parentSelector);
            (el as any)['selector'] = selector;
            (el as any)['childIndex'] = parentNode.children.length;
            
            Object.defineProperty(el, 'parentNode', {
                writable: true,
                value: this
            });
            
            const node = me.elementHandler.getNodeDataFromEl(<HTMLElement><any> el);
            me.elementHandler.linkNodeToElement(node, el);
            me.elementHandler.addNodeToParent(parentNode, node);
            
            me.sendToWorker({
                cmd: 'ADD_NODE',
                data: {
                    node: node,
                    parentNodeSelector: parentSelector
                },
            });
    
            if(me.unassignedNodes.indexOf(el) !== -1) {
                const index = me.unassignedNodes.indexOf(el);
                me.unassignedNodes.splice(index, 1);
            }
    
            return el;
        };
    
        Element.prototype.appendChild = newAppend;
        Element.prototype.insertBefore = function<T extends Node>(newChild: T, refChild: Node|null) {
    
            newAppend.call(this, newChild);
            
            return newChild;
        };
    }
    
    private replaceNativeAttribute() {
        const origSetAttr = Element.prototype.setAttribute;
        const origSetAttrNS = Element.prototype.setAttributeNS;
        const origGetAttr = Element.prototype.getAttribute;
        const me = this;
    
        Element.prototype.setAttribute = function(name: string, value: any) {
            if(name === 'easypz' || me.unassignedNodes.indexOf(this) !== -1) {
                // Update the original SVG
                origSetAttr.apply(this, arguments);
                return;
            }
            if(name === 'class') {
                origSetAttr.apply(this, arguments);
            }
            //me.updateDataFromElementAttr(this, name, value);
            me.elementHandler.queueSetAttributeOnElement(this, name, value);
        };
        Element.prototype.setAttributeNS = function(name: string, value: any) {
            console.log('setAttrNS!!');

            origSetAttrNS.apply(this, arguments);
        };
    
        Element.prototype.getAttribute = function(name) {
        
            if(me.unassignedNodes.indexOf(this) !== -1) {
                return origGetAttr.apply(this, arguments);
            } else {
                return me.elementHandler.getAttributeFromSelector(this, name);
            }
        };
    }
    
    private propagateMouseEvent(evt: MouseEvent) {
        return this.propagateEvent(new MouseEvent(evt.type, evt));
    }
    
    private propagateWheelEvent(evt: WheelEvent) {
        return this.propagateEvent(new WheelEvent(evt.type, evt));
    }
    
    private propagateEvent(new_event: MouseEvent|WheelEvent): void {
        this.svg.dispatchEvent(new_event); // for EasyPZ
    
        for(let interactionSel of this.interactionSelections)
        {
            let parentSelector = this.elementHandler.getElementSelector(interactionSel);
            let parentNode = this.vdom.getVisNodeFromSelector(parentSelector);
            //console.log(parentNode);
            //let matchingVisParent = selectedNodes[i];
            let j = 1;
            
            if(!parentNode) {
                //console.error(interactionSel, parentSelector, parentNode);
            } else {
                for(let el of parentNode.children)
                {
                    if(this.nodeAtPosition(el, new_event.clientX-10, new_event.clientY-10))
                    {
                        /*let selector = parentSelector + ' > :nth-child(' + j + ')';
                        let svgEl = this.svg.querySelector(selector);*/
                        const svgEl = this.elementHandler.getElementFromNode(el);
            
                        if(svgEl) {
                            svgEl.dispatchEvent(new_event);
                        }
                    }
                    j++;
                }
            }
        }
    }
    
    private nodeAtPosition(visNode: any, x: number, y: number): boolean
    {
        if(visNode.type === 'circle')
        {
            let distance = Math.sqrt(Math.pow(visNode.cx - x, 2) + Math.pow(visNode.cy - y, 2));
            return distance < visNode.r;
        }
        return false;
    }
    
    private sendToWorker(msg: CanvasWorkerMessage, data?: any) {
        this.worker.postMessage(msg, data);
        //console.log(roughSizeOfObject(msg));
    }
}