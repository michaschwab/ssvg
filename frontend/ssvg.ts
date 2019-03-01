import {VdomManager, VdomNode} from "../util/vdomManager";
import {CanvasWorkerMessage, CanvasUpdateWorkerMessage, CanvasUpdateData} from "../util/canvas-worker-message"
import Elementhandler from "./elementhandler";
import SvgToCanvasWorker from "../canvasworker/canvasworker";
import Canvasrenderer from "../canvasworker/canvasrenderer";
import DrawingUtils from "../canvasworker/drawingUtils";
import CanvasWorker from '../canvasworker';

export default class SSVG {
    private unassignedNodes: Node[] = [];
    private worker: Worker;
    private elementHandler: Elementhandler;
    private vdom: VdomManager;
    private interactionSelections: HTMLElement[] = [];
    
    private renderer: SvgToCanvasWorker;

    private svg: SVGElement|undefined;
    private readonly canvas: HTMLCanvasElement;
    private svgAssignedAndSizeSet = false;
    
    private lastTenCanvasDrawTimes: number[] = [];
    
    private enterExitQueue: CanvasUpdateData[] = [];

    private readonly safeMode: boolean = false;
    private readonly maxPixelRatio: number|undefined;
    private readonly useWorker: boolean = true;
    private readonly getFps: (fps: number) => void = () => {};

    constructor(options?: {
        safeMode?: boolean,
        maxPixelRatio?: number,
        useWorker?: boolean,
        getFps?: (fps: number) => void
    }) {
        if(options) {
            if(options.safeMode !== undefined) {
                this.safeMode = options.safeMode;
            }
            this.maxPixelRatio = options.maxPixelRatio;
            if(options.useWorker !== undefined) {
                this.useWorker = options.useWorker;
            }
            if(options.getFps !== undefined) {
                this.getFps = options.getFps;
            }
        }

        this.canvas = document.createElement('canvas');
        if(!('OffscreenCanvas' in window)) {
            this.useWorker = false;
        }
        
        if(this.useWorker) {
            this.worker = new CanvasWorker();
    
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
        this.canvas.addEventListener('click', e => this.propagateMouseEvent(e));
        this.canvas.addEventListener('wheel', e => this.propagateWheelEvent(e));

        this.replaceNativeRemoveChild();
        this.replaceNativeAttribute();
        this.replaceNativePathFunctions();
        this.replaceNativeCreateElement();
        this.replaceNativeAppendChild();
        this.replaceD3Attr();
        this.replaceNativeSelect();
        this.replaceD3Select();
        this.replaceD3Remove();

        setTimeout(() => {
            console.log(this.vdom.data);
        }, 1000);
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
        this.elementHandler = new Elementhandler(this.svg, this.useWorker);
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
                    //requestAnimationFrame(() => this.updateCanvas());
                    setTimeout(() => this.updateCanvas(), 1);
                    return;
                }
                this.sendUpdateToWorker(queue);
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

    private isWithinSvg(element: Element) {
        let isWithinSvg = false;
        let parentEl = element;

        while(parentEl && parentEl.parentNode) {
            if(parentEl === this.svg) {
                isWithinSvg = true;
            }
            parentEl = <Element> parentEl.parentNode;
        }
        return isWithinSvg;
    }
    
    private captureD3On() {
        if((window as any)['d3']) {
            const d3 = (window as any)['d3'];
            const originalOn = d3.selection.prototype.on;
            const me = this;

            d3.selection.prototype.on = function()
            {
                const el = this._parents && this._parents.length ? this._parents[0] : this[0].parentNode;
                let isWithinSvg = me.isWithinSvg(el);

                if(el && isWithinSvg && me.interactionSelections.indexOf(el) === -1)
                {
                    me.interactionSelections.push(el); // This one works for native get/setAttribute
                    //interactionSelections.push(this); // This one works for d3 .attr.
                }
        
                return originalOn.apply(this, arguments);
            };
        }
    }
    
    private replaceD3Select() {
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

            const origSelectAll = d3.selection.prototype.selectAll;
            d3.selection.prototype.selectAll = getReplacement(origSelectAll);

            const origSelect = d3.selection.prototype.select;
            d3.selection.prototype.select = getReplacement(origSelect);

            const origFilter = d3.selection.prototype.filter;
            d3.selection.prototype.filter = function(selectorString: string) {
                const elements = this._groups ? this._groups[0] : this[0];
                if(typeof selectorString !== 'string') {
                    return origFilter.apply(this, arguments);
                }
                const nodes = elements.map(element => me.elementHandler.getNodeFromElement(element));

                const selectors = selectorString.split(',').map(sel => sel.trim());
                const filteredNodes = [];

                for(const selector of selectors) {
                    const matchingNodes = me.vdom.filterNodesBySelector(nodes, selector);

                    for(const node of matchingNodes) {
                        if(filteredNodes.indexOf(node) === -1) {
                            filteredNodes.push(node);
                        }
                    }
                }

                const filteredElements = filteredNodes.map(node => me.elementHandler.getElementFromNode(node));

                const returnValue = origFilter.apply(this, arguments);

                if(returnValue._groups) {
                    returnValue._groups[0] = filteredElements;
                } else {
                    // Older d3 versions
                    const parentNode = returnValue[0].parentNode;
                    returnValue[0] = filteredElements;
                    returnValue[0].parentNode = parentNode;
                }
                return returnValue;
            }
        }
    }

    private replaceNativeSelect() {
        const origQuerySelector = Element.prototype.querySelector;
        const me = this;

        Element.prototype.querySelector = function(selector: string) {
            if(!me.isWithinSvg(this)) {
                return origQuerySelector.apply(this, arguments);
            }

            const node = me.elementHandler.getVisNode(this);
            const childNodes = me.vdom.getVisNodesFromSelector(node, selector);
            if(childNodes.length === 0) {
                console.warn('could not find selection', this, selector);
                return null;
            }
            return me.elementHandler.getElementFromNode(childNodes[0]);
        };
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
                    elements = elements.filter(element => element); // Remove nulls etc
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

            const origSelectionAttr = d3.selection.prototype.attr;
            d3.selection.prototype.attr = getReplacement(origSelectionAttr);

            const origSelectionStyle = d3.selection.prototype.style;
            d3.selection.prototype.style = getReplacement(origSelectionStyle, 'style;');

            const originalClassed = d3.selection.prototype.classed;
            d3.selection.prototype.classed = function(className: string,
                                                      value?: boolean|((data: any, index: number) => boolean)) {
                if(value !== undefined) {
                    let elements = this._groups ? this._groups[0] : this[0];
                    let i = 0;
                    for(let element of elements) {
                        if(element) {
                            const indexOfParent = element.childIndex;
                            const parentSelector = element['parentSelector'];
                            const parent = me.vdom.getParentNodeFromSelector(parentSelector);
                            const node = parent.children[indexOfParent];
                            const prevClassNames = node.className || '';
                            const evaluatedValue = typeof value === "function" ? value((<any> element).__data__, i) : value;
                            if(evaluatedValue === true) {
                                const newClassNames = prevClassNames === '' ? className : prevClassNames + ' ' + className;
                                me.elementHandler.queueSetAttributeOnElement(element, 'class', newClassNames);

                            } else if(evaluatedValue === false) {
                                const newClassNames = prevClassNames.replace(className, '').replace('  ', ' ');
                                me.elementHandler.queueSetAttributeOnElement(element, 'class', newClassNames);
                            }
                        }

                        i++;
                    }
                }
                return originalClassed.apply(this, arguments);
            };

            const originalText = d3.selection.prototype.text;
            d3.selection.prototype.text = function(value?: boolean|((data: any, index: number) => boolean)) {
                if(value !== undefined) {
                    let elements = this._groups ? this._groups[0] : this[0];
                    let i = 0;
                    for(let element of elements) {
                        if(element !== undefined) {
                            const evaluatedValue = typeof value === "function" ? value((<any> element).__data__, i) : value;
                            me.elementHandler.queueSetAttributeOnElement(element, 'text', evaluatedValue);
                        }

                        i++;
                    }
                }
                return originalText.apply(this, arguments);
            };
        }
    }

    private replaceD3Remove() {
        if(window['d3']) {
            const d3 = window['d3'];
            const me = this;

            const newRemove = this.getNewRemoveChild(true);
            d3.selection.prototype.remove = function() {
                let elements = this._groups ? this._groups[0] : this[0];

                if(elements.length) {
                    let parentNode = null;
                    for(let i = elements.length - 1; i > -1; i--) {
                        const element = elements[i];
                        if(element) {
                            parentNode = element.parentNode;
                            if(!parentNode) {
                                console.error('element has no parent node', element);
                            }
                            newRemove.call(parentNode, element);
                        }

                    }
                    if(parentNode) {
                        me.updateChildSelectors(parentNode);
                    }
                }
            }
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
    
            el.appendChild = me.getNewAppendChild(el.appendChild);
            
            me.unassignedNodes.push(el);
    
            //console.log(me.unassignedNodes);
            
            return el;
        }
    }

    private updateChildSelectors(parentElement: Element) {
        const parentSelector = parentElement['selector'];
        if(!parentSelector) {
            console.error('this node has no selector', parentElement)
        }
        const parentNode = this.vdom.getParentNodeFromSelector(parentSelector);
        for(let i = 0; i < parentNode.children.length; i++) {
            const childNode: VdomNode = parentNode.children[i];
            const childElement = this.elementHandler.getElementFromNode(childNode);
            if(!childElement) {
                console.error('element not found', childNode, parentNode.children.length, i);
                continue;
            }
            childElement['childIndex'] = i;
            childElement['parentSelector'] = parentSelector;
            childElement['selector'] = this.elementHandler.combineElementSelectors(parentSelector, childNode.type, i+1);

            this.updateChildSelectors(childElement);
        }
    }

    private getNewRemoveChild(skipUpdateSelectors = false) {
        const me = this;

        return function<T extends Node>(this: Element, el: T) {
            if(!this) {
                console.error('context not defined');
                return el;
            }
            const parentNode = me.elementHandler.getNodeFromElement(<Element> <any> this);
            const parentSelector = this['selector'];
            const node = me.elementHandler.getNodeFromElement(<Element> <any> el);

            // Remove from current parent first.
            Object.defineProperty(el, 'parentNode', {
                writable: true,
                value: undefined
            });

            //console.log('remove')
            me.enterExitQueue.push({
                cmd: 'EXIT',
                childIndex: el['childIndex'],
                parentNodeSelector: parentSelector
            });

            me.elementHandler.removeNodeFromParent(<Element> <any> el, node);

            // Fix child indices of all children.
            if(!skipUpdateSelectors) {
                if(!parentSelector) {
                    console.error('parent not found', parentNode, parentSelector, this, el);
                }
                me.updateChildSelectors(this);
            }

            delete el['selector'];

            return el;
        };
    }

    private replaceNativeRemoveChild() {
        Element.prototype.removeChild = this.getNewRemoveChild();
    }
    
    private getNewAppendChild(origAppend) {
        const me = this;
        
        return function<T extends Node>(this: Element, el: T) {
            if(!me.svgAssignedAndSizeSet) {
                if(!me.svg && el['tagName'] === 'svg') {
                    const appended = origAppend.apply(this, arguments);
                    me.setupElementsIfSvgExists(<SVGElement> <any> el);
                    return appended;
                    
                } else {
                    return origAppend.apply(this, arguments);
                }
            }
            
            if(!me.isWithinSvg(this)) {
                return origAppend.apply(this, arguments);
            }

            Object.defineProperty(el, 'ownerSVGElement', {
                writable: true,
                value: me.svg
            });
            el['appendChild'] = <T extends Node>(el2: T) => {
                return me.getNewAppendChild(origAppend).call(el, el2);
            };
            const parentSelector = me.elementHandler.getElementSelector(this);
            if(parentSelector === null) {
                return origAppend.apply(this, arguments);
            }

            const parentNode = me.vdom.getVisNodeFromSelector(parentSelector);
            if(!parentNode) {
                return console.error('parent node not found', parentSelector, this);
            }
            let node: VdomNode;
            let keepChildren = false;

            if(el['parentSelector']) {
                node = me.elementHandler.getVisNode(<Element> <any> el);

                me.getNewRemoveChild().call(this, el);
                keepChildren = true; // If the element is being moved around, keep children.
            } else {
                node = me.elementHandler.getNodeDataFromEl(<HTMLElement><any> el);
            }

            (el as any)['parentSelector'] = parentSelector;
            (el as any)['selector'] = me.elementHandler.getElementSelector(<Element><any> el);
            (el as any)['childIndex'] = parentNode.children.length;
    
            Object.defineProperty(el, 'parentNode', {
                writable: true,
                value: this
            });
    
            me.elementHandler.linkNodeToElement(node, el);
            me.elementHandler.addNodeToParent(parentNode, node);
            me.updateChildSelectors(el as unknown as Element);
            
            if(me.useWorker) {
                me.enterExitQueue.push({
                    cmd: 'ENTER',
                    node: node,
                    parentNodeSelector: parentSelector,
                    keepChildren: keepChildren
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
    
    private replaceNativeAppendChild() {
        const origAppendChild = Element.prototype.appendChild;
        const newAppend = this.getNewAppendChild(origAppendChild);
    
        Element.prototype.appendChild = newAppend;
        Element.prototype.insertBefore = function<T extends Node>(newChild: T, refChild: Node|null) {
    
            newAppend.call(this, newChild);
            
            return newChild;
        };
    }

    private replaceNativePathFunctions() {
        const me = this;
        //const origGetPointAtLength = SVGPathElement.prototype.getPointAtLength;
        const origGetTotalLength = SVGPathElement.prototype.getTotalLength;

        /*SVGPathElement.prototype.getPointAtLength = function() {
            if(me.isWithinSvg(this)) {
                const d = this.getAttribute('d');
                me.origSetAttribute.call(this, 'd', d);
            }
            return origGetPointAtLength.apply(this, arguments);
        };*/
        SVGPathElement.prototype.getTotalLength = function() {
            if(me.isWithinSvg(this)) {
                const d = this.getAttribute('d');
                me.origSetAttribute.call(this, 'd', d);
            }

            return origGetTotalLength.apply(this, arguments);
        };
    }

    private origSetAttribute;

    private replaceNativeAttribute() {
        const origSetAttr = Element.prototype.setAttribute;
        this.origSetAttribute = origSetAttr;
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
            if(!me.isWithinSvg(this)) {
                return origSetAttr.apply(this, arguments);
            }
            me.elementHandler.queueSetAttributeOnElement(this, name, value);
        };
        //TODO: Figure out how to access the element when setting a style property.
        /*CSSStyleDeclaration.prototype.setProperty = function(name: string, value: any) {
            safeLog(this, arguments);
            me.elementHandler.queueSetAttributeOnElement(this, 'style;' + name, value);
        };*/
        Element.prototype.setAttributeNS = function(name: string, value: any) {
            if(name === 'easypz' || me.unassignedNodes.indexOf(this) !== -1) {
                // Update the original SVG
                origSetAttrNS.apply(this, arguments);
                return;
            }
            if(name === 'class') {
                origSetAttrNS.apply(this, arguments);
            }
            if(!me.isWithinSvg(this)) {
                return origSetAttrNS.apply(this, arguments);
            }
            me.elementHandler.queueSetAttributeOnElement(this, name, value);
        };
    
        Element.prototype.getAttribute = function(name) {
            if(me.unassignedNodes.indexOf(this) !== -1) {
                return origGetAttr.apply(this, arguments);
            } else {
                try {
                    return me.elementHandler.getAttributeFromSelector(this, name);
                } catch(e) {
                    console.error(e);
                    return origGetAttr.apply(this, arguments);
                }
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
    
    private nodeAtPosition(visNode: VdomNode, x: number, y: number): boolean
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
        
        if(this.lastTenCanvasDrawTimes.length > 100) {
            this.lastTenCanvasDrawTimes.shift(); // Remove first item
        }
    }
    
    private updateFps() {
        if(this.lastTenCanvasDrawTimes.length) {
            const timeForTenDrawsMs = Date.now() - this.lastTenCanvasDrawTimes[0];
            const fps = Math.round(this.lastTenCanvasDrawTimes.length / timeForTenDrawsMs * 1000);
            this.getFps(fps);
        }
    }

    private sendUpdateToWorker(queue) {
        const msg: CanvasUpdateWorkerMessage = {
            cmd: 'UPDATE_NODES',
            data: {
                enterExit: this.enterExitQueue,
                update: queue,
            }
        };

        this.sendToWorker(msg);

        this.enterExitQueue = [];
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