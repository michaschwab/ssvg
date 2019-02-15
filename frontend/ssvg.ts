import VDom from "../util/vdom";
import CanvasWorkerMessage from "../util/canvas-worker-message"
import Elementhandler from "./elementhandler";
import SvgToCanvasWorker from "../canvasworker/canvasworker";
import Canvasrenderer from "../canvasworker/canvasrenderer";
import Webglrenderer from "../canvasworker/webglrenderer";
import DrawingUtils from "../canvasworker/drawingUtils";

export default class SSVG {
    private unassignedNodes: Node[] = [];
    private worker: Worker;
    private elementHandler: Elementhandler;
    private vdom: VDom;
    private interactionSelections: HTMLElement[] = [];
    
    private renderer: SvgToCanvasWorker;

    private svg: SVGElement|undefined;
    private canvas: HTMLCanvasElement;
    private svgAssignedAndSizeSet = false;
    
    private lastTenCanvasDrawTimes: number[] = [];
    
    private showFpsElement: HTMLElement;
    
    constructor(private safeMode = false, private maxPixelRatio?: number|undefined, private useWorker = true) {
        this.canvas = document.createElement('canvas');
        if(!('OffscreenCanvas' in window)) {
            this.useWorker = false;
        }
        
        if(this.useWorker) {
            const scripts = Array.from(document.getElementsByTagName("script"));
            const thisScript = scripts.filter(script => script.src.indexOf('ssvg') !== -1 &&
                script.src.indexOf('frontend.js') !== -1);
            const path = thisScript[0].src.substr(0, thisScript[0].src.length - 'frontend.js'.length);
    
            this.worker = new Worker(path + 'canvasworker.js');
    
            this.worker.onmessage = e => {
                if(e.data && e.data.msg && e.data.msg === 'DRAWN') {
                    this.logDrawn();
                    this.updateCanvas();
                }
            };
            const raf = () => {
                this.updateFps();
                requestAnimationFrame(raf);
            };
            raf();
        } else {
            const raf = () => {
                this.updateFps();
                this.logDrawn();
                this.updateCanvas();
                requestAnimationFrame(raf);
            };
            raf();
        }

        this.captureD3On();
        this.setupElementsIfSvgExists();
        
        this.canvas.addEventListener('mousedown', e => this.propagateMouseEvent(e));
        this.canvas.addEventListener('mousemove', e => this.propagateMouseEvent(e));
        this.canvas.addEventListener('mouseup', e => this.propagateMouseEvent(e));
        this.canvas.addEventListener('wheel', e => this.propagateWheelEvent(e));

        this.replaceNativeAttribute();
        this.replaceNativeCreateElement();
        this.replaceNativeAppend();
        this.replaceD3Attr();
        this.replaceD3SelectAll();
        
        this.showFpsElement = document.createElement('div');
        this.showFpsElement.style.position = 'absolute';
        this.showFpsElement.style.top = '30px';
        this.showFpsElement.style.right = '30px';
        this.showFpsElement.style.opacity = '0.2';
        this.showFpsElement.style.fontSize = '50px';
        
        document.body.appendChild(this.showFpsElement);
    }
    
    private setupElementsIfSvgExists(svgEl?: SVGElement) {
        
        if(this.svg) {
            return true;
        }
        
        const svg = !svgEl ? document.getElementsByTagName('svg')[0] : svgEl;
        
        if(!svg) {
            return false;
        }
        
        this.svg = svg;
        this.svg.parentElement.appendChild(this.canvas);
        this.elementHandler = new Elementhandler(this.svg, () => this.updateCanvas());
        this.vdom = this.elementHandler.getVDom();

        this.setCanvasSize();
        
        return true;
    }
    
    private updateCanvas() {
        if(!this.svgAssignedAndSizeSet) {
            return;
        }
        if(this.useWorker) {
            this.elementHandler.useAttrQueue(queue => {
                if(Object.keys(queue).length === 0) {
                    requestAnimationFrame(() => this.updateCanvas());
                    return;
                }
                this.sendToWorker({
                    cmd: 'UPDATE_NODES',
                    data: {
                        queue: queue,
                    },
                });
            });
        } else {
            this.elementHandler.useAttrQueue(queue => {
                if(this.renderer.updatePropertiesFromQueue) {
                    this.renderer.updatePropertiesFromQueue(queue);
                }
                this.renderer.draw();
            });
        }
    }
    
    private setCanvasSize() {
        if(!this.svg || !this.vdom.data.width || !this.vdom.data.height) {
            return;
        }
        this.vdom.data.scale = window.devicePixelRatio;
        if(this.maxPixelRatio !== undefined && this.vdom.data.scale > this.maxPixelRatio) {
            this.vdom.data.scale = this.maxPixelRatio;
        }
    
        this.canvas.style.width = this.vdom.data.width + 'px';
        this.canvas.style.height = this.vdom.data.height + 'px';
        this.canvas.width = this.vdom.data.width * this.vdom.data.scale;
        this.canvas.height = this.vdom.data.height * this.vdom.data.scale;
        
        if(this.useWorker) {
            const offscreen = (this.canvas as any).transferControlToOffscreen();
            this.sendToWorker({cmd: 'INIT', data: {
                    canvas: offscreen,
                    visData: this.vdom.data,
                    safeMode: this.safeMode
                }
            }, [offscreen]);
        } else {
            this.renderer = new Canvasrenderer(this.vdom, this.canvas, this.safeMode, () => {});
        }
        
        this.svgAssignedAndSizeSet = true;
    }
    
    private captureD3On() {
        if((window as any)['d3']) {
            const d3 = (window as any)['d3'];
            const originalOn = d3.selection.prototype.on;
            const me = this;

            d3.selection.prototype.on = function()
            {
                const el = this._parents && this._parents.length ? this._parents[0] : this[0].parentNode;
                let parentEl = el;
                let isWithinSvg = false;

                while(parentEl && parentEl.parentNode) {
                    if(parentEl === me.svg) {
                        isWithinSvg = true;
                    }
                    parentEl = parentEl.parentNode;
                }

                if(el && isWithinSvg && me.interactionSelections.indexOf(el) === -1)
                {
                    me.interactionSelections.push(el); // This one works for native get/setAttribute
                    //interactionSelections.push(this); // This one works for d3 .attr.
                }
        
                return originalOn.apply(this, arguments);
            };
        }
    }
    
    private replaceD3SelectAll() {
        if((window as any)['d3']) {
            const me = this;
            const d3 = (window as any)['d3'];

            const getReplacement = (original) => {
                return function(selector) {
                    if(typeof selector === 'string') {
                        const element = this._groups ? this._groups[0][0] : this[0][0];

                        const node = me.elementHandler.getVisNode(element);
                        const childNodes = me.vdom.getVisNodesFromSelector(node, selector);
                        const childElements = childNodes.map(node => {
                            return me.elementHandler.getElementFromNode(node);
                        });

                        const returnValue = original.apply(this, arguments);

                        if(returnValue._groups) {
                            returnValue._groups[0] = childElements;
                        } else {
                            // Older d3 versions
                            const parentNode = returnValue[0].parentNode;
                            returnValue[0] = childElements;
                            returnValue[0].parentNode = parentNode;
                        }

                        return returnValue;
                    }

                    return original.apply(this, arguments);
                }
            };

            let origSelectAll = d3.selection.prototype.selectAll;
            d3.selection.prototype.selectAll = getReplacement(origSelectAll);

            let origSelect = d3.selection.prototype.select;
            d3.selection.prototype.select = getReplacement(origSelect);
        }
    }
    
    private replaceD3Attr() {

        const me = this;

        function getReplacement(originalFct, prefix = '') {
            return function(name, value) {
                
                if(value === undefined) {
    
                    if(me.unassignedNodes.indexOf(this) !== -1) {
                        return originalFct.apply(this, arguments);
                    } else {
                        return me.elementHandler.getAttributesFromSelector(this, prefix + name);
                    }
                } else {
                    if(name === 'class' || !me.svg) {
                        return originalFct.apply(this, arguments);
                    }
                    // For d3 v4, this would just be this.groups[0]. The rest is for
                    // earlier versions, where selectAll() returned other values.
                    let elements = this._groups ? this._groups[0] : this[0];
                    if(typeof elements === 'object' && Object.keys(elements).length === 1 && elements.parentNode) {
                        const parentElement = elements.parentNode;
                        const selector = me.elementHandler.getElementSelector(parentElement);
                        const parentNode = me.vdom.getVisNodeFromSelector(selector);
                        elements = [];
                        for(const child of parentNode.children) {
                            elements.push(me.elementHandler.getElementFromNode(child));
                        }
                    }
                    if(elements.length === 1) {
                        const element = elements[0];
                        if(!element) {
                            console.warn('element not found', this, name, value);
                            return this;
                        }
                        me.elementHandler.queueSetAttributeOnElement(element, prefix + name, value);
                    } else {
                        me.elementHandler.queueSetAttributeOnSelection(elements, prefix + name, value);
                    }
                    
                    if(elements[0] === me.svg && (name === 'width' || name === 'height')) {
                        me.vdom.data[name] = value;
                        me.setCanvasSize();
                    }
                
                    return this;
                }
            };
        }
    
        if((window as any)['d3']) {
            const d3 = (window as any)['d3'];
    
            let origSelectionAttr = d3.selection.prototype.attr;
            d3.selection.prototype.attr = getReplacement(origSelectionAttr);
    
            let origSelectionStyle = d3.selection.prototype.style;
            d3.selection.prototype.style = getReplacement(origSelectionStyle, 'style;');
            
        }
    }
    
    private replaceNativeCreateElement() {
        const origCreate = document.createElementNS;
        const me = this;
        
        document.createElementNS = function() {
            let newArgs = Array.from(arguments);
            const el = origCreate.apply(this, newArgs);
            
            /*el.appendChild = () => {
                console.log('hi!!', el, arguments);
                //return el;
            };*/
    
            el.appendChild = me.getNewAppend(el.appendChild);
            
            me.unassignedNodes.push(el);
    
            //console.log(me.unassignedNodes);
            
            return el;
        }
    }
    
    private getNewAppend(origAppend) {
        const me = this;
        
        return function<T extends Node>(this: Element, el: T) {
    
            //todo make sure el is within svg, or if this.svg doesn't exist, that it is the svg.
            if(!me.svgAssignedAndSizeSet) {
                if(!me.svg && el['tagName'] === 'svg') {
                    const appended = origAppend.apply(this, arguments);
                    me.setupElementsIfSvgExists(<SVGElement> <any> el);
                    return appended;
                    
                } else {
                    return origAppend.apply(this, arguments);
                }
            }
            
            //todo check if outside of the svg element
            if(el['tagName'] === 'CANVAS') {
                return origAppend.apply(this, arguments);
            }

            el['appendChild'] = <T extends Node>(el2: T) => {
                return me.getNewAppend(origAppend).call(el, el2);
            };
            const parentSelector = me.elementHandler.getElementSelector(this);
            if(parentSelector === null) {
                return origAppend.apply(this, arguments);
            }
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
            
            //console.log(parentNode, node);
    
            if(me.useWorker) {
                me.sendToWorker({
                    cmd: 'ADD_NODE',
                    data: {
                        node: node,
                        parentNodeSelector: parentSelector
                    },
                });
            } else {
                if(me.renderer.addNode) {
                    me.renderer.addNode(node);
                }
            }
    
            if(me.unassignedNodes.indexOf(el) !== -1) {
                const index = me.unassignedNodes.indexOf(el);
                me.unassignedNodes.splice(index, 1);
            }
    
            return el;
        };
    }
    
    private replaceNativeAppend() {
        const origAppendChild = Element.prototype.appendChild;
        const newAppend = this.getNewAppend(origAppendChild);
    
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
        //TODO: Figure out how to access the element when setting a style property.
        /*CSSStyleDeclaration.prototype.setProperty = function(name: string, value: any) {
            safeLog(this, arguments);
            me.elementHandler.queueSetAttributeOnElement(this, 'style;' + name, value);
        };*/
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
            
            //let matchingVisParent = selectedNodes[i];
            let j = 1;
            
            if(!parentNode) {
                //console.error(interactionSel, parentSelector, parentNode);
            } else {
                for(let vdomNode of parentNode.children)
                {
                    if(this.nodeAtPosition(vdomNode, new_event.clientX-10, new_event.clientY-10))
                    {
                        /*let selector = parentSelector + ' > :nth-child(' + j + ')';
                        let svgEl = this.svg.querySelector(selector);*/
                        const svgEl = this.elementHandler.getElementFromNode(vdomNode);
            
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
            let cx = visNode.cx || 0;
            let cy = visNode.cy || 0;
            if(visNode.transform) {
                const transform = DrawingUtils.parseTransform(visNode.transform);
                if(transform.translateX) {
                    cx += transform.translateX;
                }
                if(transform.translateY) {
                    cy += transform.translateY;
                }
            }
            let distance = Math.sqrt(Math.pow(cx - x, 2) + Math.pow(cy - y, 2));
            return distance < visNode.r;
        } else if(visNode.type === 'g') {
            if(visNode.transform) {
                const transform = DrawingUtils.parseTransform(visNode.transform);
                if(transform.translateX) {
                    x -= transform.translateX;
                }
                if(transform.translateY) {
                    y -= transform.translateY;
                }
            }

            let matchAny = false;
            for(let i = 0; i < visNode.children.length; i++) {
                if(this.nodeAtPosition(visNode.children[i], x, y)) {
                    matchAny = true;
                }
            }
            return matchAny;
        }
        return false;
    }
    
    private logDrawn() {
        this.lastTenCanvasDrawTimes.push(Date.now());
        
        if(this.lastTenCanvasDrawTimes.length > 10) {
            this.lastTenCanvasDrawTimes.shift(); // Remove first item
        }
    }
    
    private updateFps() {
        if(this.lastTenCanvasDrawTimes.length) {
            const timeForTenDrawsMs = Date.now() - this.lastTenCanvasDrawTimes[0];
            const fps = Math.round(this.lastTenCanvasDrawTimes.length / timeForTenDrawsMs * 1000);
            this.showFpsElement.innerText = fps + ' FPS';
        }
    }
    
    private sendToWorker(msg: CanvasWorkerMessage, data?: any) {
        this.worker.postMessage(msg, data);
        //console.log(roughSizeOfObject(msg));
    }
}


let safeLogCount = 0;
function safeLog(...logContents) {
    
    if(safeLogCount < 50) {
        safeLogCount++;
        console.log(...logContents);
    }
}
function safeErrorLog(...logContents) {
    
    if(safeLogCount < 50) {
        safeLogCount++;
        console.error(...logContents);
    }
}