import {VdomManager} from "../util/vdom/vdom-manager";
import {VdomNode} from "../util/vdom/vdom";
import {CanvasWorkerMessage, CanvasUpdateWorkerMessage, CanvasUpdateData} from "../util/canvas-worker-message"
import Domhandler from "./domhandler";
import CanvasWorker from "../canvasworker/canvasworker";
import Canvasrenderer from "../canvasworker/canvasrenderer";
import DrawingUtils from "../canvasworker/drawingUtils";
import CanvasWorkerImporter from '../canvasworker';

export default class SSVG {
    private unassignedNodes: Node[] = [];
    private worker: Worker;
    private domHandler: Domhandler;
    private vdom: VdomManager;
    private interactionSelections: HTMLElement[] = [];
    
    private renderer: CanvasWorker;

    private svg: SVGElement|undefined;
    private readonly canvas: HTMLCanvasElement;
    private svgAssignedAndSizeSet = false;
    
    private lastTenCanvasDrawTimes: number[] = [];
    
    private enterExitQueue: CanvasUpdateData[] = [];

    private readonly safeMode: boolean = false;
    private readonly maxPixelRatio: number|undefined;
    private readonly useWorker: boolean = true;
    private readonly getFps: (fps: number) => void = () => {};

    private hoveredElement: Element|undefined;

    constructor(options?: {
        safeMode?: boolean,
        maxPixelRatio?: number,
        useWorker?: boolean,
        getFps?: (fps: number) => void,
        svg?: SVGElement,
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
            this.worker = new CanvasWorkerImporter();
    
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
        const svg = options && options.svg ? options.svg : undefined;
        this.setupElementsIfSvgExists(svg);
        
        this.canvas.addEventListener('mousedown', e => this.propagateMouseEvent(e));
        this.canvas.addEventListener('touchstart', e => this.propagateTouchEvent(e));
        this.canvas.addEventListener('mousemove', e => {
            const lastHovered = this.hoveredElement;
            this.hoveredElement = this.propagateMouseEvent(e);
            if(lastHovered !== this.hoveredElement) {
                if(lastHovered) {
                    lastHovered.dispatchEvent(new MouseEvent('mouseout', e));
                }
            }
            this.propagateMouseEvent(e, 'mouseover');
        });
        this.canvas.addEventListener('touchmove', e => {
            const lastHovered = this.hoveredElement;
            this.hoveredElement = this.propagateTouchEvent(e);
            if(lastHovered !== this.hoveredElement) {
                if(lastHovered) {
                    lastHovered.dispatchEvent(this.duplicateTouchEvent(e, 'mouseout'));
                }
            }
            this.propagateTouchEvent(e, 'mouseover');
        });
        this.canvas.addEventListener('mouseup', e => this.propagateMouseEvent(e));
        this.canvas.addEventListener('touchend', e => this.propagateTouchEvent(e));
        this.canvas.addEventListener('click', e => this.propagateMouseEvent(e));
        this.canvas.addEventListener('wheel', e => this.propagateWheelEvent(e));

        this.replaceNativeRemoveChild();
        this.replaceNativeAttribute();
        this.replaceNativePathFunctions();
        this.replaceNativeCreateElement();
        this.replaceNativeAppendChild();
        this.replaceD3Attr();
        this.replaceNativeSelect();
        this.replaceNativeGetComputedStyle();
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

        const urlConnector = document.location.href.indexOf('?') === -1 ? '?' : '&';
        const svgSwitchUrl = document.location.href + urlConnector + 'svg';
        const svgSwitchComment = document.createComment(' This project uses SSVG.io to render a SVG as Canvas.\r\n' +
            'To inspect the SVG, please open the following URL:\r\n' +
            svgSwitchUrl + '\r\n');
        
        this.svg = svg;
        const parent = this.svg.parentElement;

        if(this.svg.nextSibling) {
            const next = this.svg.nextSibling;
            parent.insertBefore(svgSwitchComment, next);
            parent.insertBefore(this.canvas, next);
        } else {
            parent.appendChild(svgSwitchComment);
            parent.appendChild(this.canvas);
        }

        this.domHandler = new Domhandler(this.svg, this.useWorker, this.useWorker);
        this.vdom = this.domHandler.getVDom();

        this.setCanvasSize();
        
        return true;
    }
    
    private updateCanvas() {
        if(!this.svgAssignedAndSizeSet) {
            return;
        }
        if(this.useWorker) {
            this.domHandler.useAttrQueue(queue => {
                if(Object.keys(queue).length === 0) {
                    //requestAnimationFrame(() => this.updateCanvas());
                    setTimeout(() => this.updateCanvas(), 1);
                    return;
                }

                for(let operation of this.enterExitQueue) {
                    if(operation.cmd === 'ENTER') {
                        if(!operation.keepChildren) {
                            operation.node.children = [];
                        }
                        this.vdom.addNode(operation.node, operation.parentNodeIndex);
                    } else if(operation.cmd === 'EXIT') {
                        this.vdom.removeNode(operation.childIndex, operation.parentNodeSelector);
                    }
                }
                this.sendUpdateToWorker(queue);
            });
        } else {
            this.domHandler.useAttrQueue(queue => {
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
            this.vdom.ensureNodesMapped();
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
                let el = this._parents && this._parents.length ? this._parents[0] : this[0].parentNode;
                if(el === document.children[0]) {
                    el = me.svg;
                }
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
                return function(selector: string|(()=>{})) {
                    if(typeof selector === 'string') {

                        let element: HTMLElement|SVGElement;
                        if(this === d3) {
                            element = me.svg;
                        } else {
                            element = this._groups ? this._groups[0][0] : this[0][0];
                        }

                        if(!element) {
                            console.error('no element', this, selector);
                            return original.apply(this, arguments);
                        }
                        const node = me.domHandler.getVisNode(element);

                        if(!node) {
                            console.warn('node not found', element);
                            return original.apply(this, arguments);
                        }

                        const childNodes = me.vdom.getVisNodesFromSelector(node, selector);
                        const childElements = childNodes.map(node => {
                            return me.domHandler.getElementFromNode(node);
                        });

                        const returnValue = original.apply(this, arguments);
                        const elementsOutsideSvg: NodeList = returnValue._groups ? returnValue._groups[0]
                            : returnValue[0];
                        elementsOutsideSvg.forEach(childNode => {
                            const childEl = <Element> <any> childNode;
                            if(childElements.indexOf(childEl) === -1) {
                                childElements.push();
                            }
                        });

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

            d3.selection.prototype.selectAll = getReplacement(d3.selection.prototype.selectAll);
            d3.selectAll = getReplacement(d3.selectAll);
            d3.selection.prototype.select = getReplacement(d3.selection.prototype.select);
            d3.select = getReplacement(d3.select);

            const origFilter = d3.selection.prototype.filter;
            d3.selection.prototype.filter = function(selectorString: string) {
                const elements = this._groups ? this._groups[0] : this[0];
                if(typeof selectorString !== 'string') {
                    return origFilter.apply(this, arguments);
                }
                let firstElement = elements[0];
                let i = 1;
                while(!firstElement && i < elements.length) {
                    i++;
                    firstElement = elements[i];
                }

                const parentNode = firstElement ? me.domHandler.getNodeFromElement(firstElement.parentNode) : null;
                const nodes = elements.map(element => me.domHandler.getNodeFromElement(element));

                const selectors = selectorString.split(',').map(sel => sel.trim());
                const filteredNodes = [];

                for(const selector of selectors) {
                    const matchingNodes = me.vdom.filterNodesBySelector(parentNode, nodes, selector);

                    for(const node of matchingNodes) {
                        if(filteredNodes.indexOf(node) === -1) {
                            filteredNodes.push(node);
                        }
                    }
                }

                const filteredElements = filteredNodes.map(node => me.domHandler.getElementFromNode(node));

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

    private replaceNativeGetComputedStyle() {
        const origGetComputedStyle = window.getComputedStyle;
        const me = this;

        window.getComputedStyle = function(element: HTMLElement) {
            if(element && !me.isWithinSvg(element) && (<Window> <any> element) !== window) {
                return origGetComputedStyle.call(this, element);
            }

            const node = me.domHandler.getNodeFromElement(element);
            if(!node) {
                console.warn('node not found for ', this, element);
                return origGetComputedStyle.call(this, element);
            }
            return {
                getPropertyValue(propertyName: string): string {
                    //console.log(propertyName, node, node.style[propertyName]);
                    return node.style[propertyName];
                }
            } as CSSStyleDeclaration;
        };
    }

    private replaceNativeSelect() {
        const origQuerySelector = Element.prototype.querySelector;
        const me = this;

        Element.prototype.querySelector = function(selector: string) {
            if(!me.isWithinSvg(this)) {
                return origQuerySelector.apply(this, arguments);
            }

            const node = me.domHandler.getVisNode(this);
            const childNodes = me.vdom.getVisNodesFromSelector(node, selector);
            if(childNodes.length === 0) {
                console.warn('could not find selection', this, node, node.globalElementIndex, selector);
                return null;
            }
            return me.domHandler.getElementFromNode(childNodes[0]);
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
                        // Dealing with d3 v3.
                        const els = this._groups ? this._groups[0] : this[0];
                        if(els[0] && !me.isWithinSvg(els[0])) {
                            return originalFct.apply(this, arguments);
                        }
                        if(els.length > 1) {
                            const returnVal = [];
                            for(const el of els) {
                                returnVal.push(me.domHandler.getAttributeFromSelector(el, name))
                            }
                            return returnVal;
                        } else {
                            return me.domHandler.getAttributeFromSelector(els[0], name);
                        }
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
                        let parentNode: VdomNode;
                        if(parentElement !== document.children[0]) {
                            const selector = me.domHandler.getElementSelector(parentElement);
                            if(selector === null) {
                                console.error('selector not found', parentElement, elements);
                                throw Error('selector not found');
                            }
                            parentNode = me.vdom.getVisNodeFromSelector(selector);
                        } else {
                            parentNode = me.vdom.data;
                        }

                        elements = [];
                        for(const child of parentNode.children) {
                            elements.push(me.domHandler.getElementFromNode(child));
                        }
                    }
                    if(!elements) {
                        return originalFct.apply(this, arguments);
                    }
                    const filteredElements = [];
                    try {
                        for (const element of elements) {
                            if (element) {
                                filteredElements.push(element);
                            }
                        }
                    } catch(e) {
                        console.error(elements, this);
                        console.error(e);
                    }
                    if(filteredElements.length === 1) {
                        const element = filteredElements[0];
                        if(!element) {
                            console.warn('element not found', this, name, value);
                            return this;
                        }
                        if(!me.isWithinSvg(element)) {
                            return originalFct.apply(this, arguments);
                        }
                        me.domHandler.queueSetAttributeOnElement(element, prefix + name, value);
                    } else {
                        if(!me.isWithinSvg(elements[0])) {
                            return originalFct.apply(this, arguments);
                        }
                        me.domHandler.queueSetAttributeOnSelection(filteredElements, prefix + name, value);
                    }
                    
                    if(filteredElements[0] === me.svg && (name === 'width' || name === 'height')) {
                        me.vdom.data[name] = parseInt(value);
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
                    me.domHandler.enableFrontendDesignProperties();
                    let elements = this._groups ? this._groups[0] : this[0];
                    let i = 0;
                    for(let element of elements) {
                        if(element) {
                            const indexOfParent = element.childIndex;
                            const parentSelector = element['parentSelector'];
                            const parent = me.vdom.getParentNodeFromSelector(parentSelector);
                            const node = parent.children[indexOfParent];
                            if(!node) {
                                console.warn('node not found', element, parent, indexOfParent, className);
                                continue;
                            }
                            const prevClassNames = node.className || '';
                            const evaluatedValue = typeof value === "function" ? value((<any> element).__data__, i) : value;
                            if(evaluatedValue === true) {
                                if(prevClassNames.indexOf(className) === -1) {
                                    let newClassNames = (prevClassNames + ' ' + className).trim();

                                    me.domHandler.queueSetAttributeOnElement(element, 'class', newClassNames);
                                }
                            } else if(evaluatedValue === false) {
                                const containedPreviously = prevClassNames.indexOf(className) !== -1;
                                if(containedPreviously) {
                                    const newClassNames = prevClassNames.replace(className, '').replace('  ', ' ');
                                    me.domHandler.queueSetAttributeOnElement(element, 'class', newClassNames);

                                    if(!node['removedClasses']) {
                                        node['removedClasses'] = [];
                                    }
                                    node['removedClasses'].push(className); // For removing associated styles.
                                }
                            }
                        }

                        i++;
                    }
                }
                return originalClassed.apply(this, arguments);
            };

            const originalTransition = d3.selection.prototype.transition;
            d3.selection.prototype.transition = function() {
                me.domHandler.enableFrontendDesignProperties();
                return originalTransition.apply(this, arguments);
            };

            const originalText = d3.selection.prototype.text;
            d3.selection.prototype.text = function(value?: boolean|((data: any, index: number) => boolean)) {
                if(value !== undefined) {
                    let elements = this._groups ? this._groups[0] : this[0];
                    let i = 0;
                    for(let element of elements) {
                        if(element && me.isWithinSvg(element)) {
                            const evaluatedValue = typeof value === "function" ? value((<any> element).__data__, i) : value;
                            me.domHandler.queueSetAttributeOnElement(element, 'text', evaluatedValue);
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

            const newRemove = this.getNewRemoveChild(() => {}, true);
            const d3Remove = function() {
                let elements = this._groups ? this._groups[0] : this[0];

                if(elements.length) {
                    let parentElement: HTMLElement = null;
                    for(let i = elements.length - 1; i > -1; i--) {
                        const element = elements[i];
                        if(element) {
                            parentElement = element.parentNode;
                            if(!parentElement) {
                                console.error('element has no parent node', element);
                            }
                            newRemove.call(parentElement, element);
                        }

                    }
                    if(parentElement) {
                        me.updateChildSelectors(parentElement);
                    }
                }
                return this;
            };
            d3.selection.prototype.remove = d3Remove;
            //d3.transition.prototype.remove = d3Remove;
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

    private updateChildSelectors(parentElement: Element, parentNode?: VdomNode) {
        const parentSelector = parentElement['selector'];
        if(!parentSelector) {
            console.error('this node has no selector', parentElement)
        }
        if(!parentNode) {
            parentNode = this.vdom.getParentNodeFromSelector(parentSelector);
        }
        for(let i = 0; i < parentNode.children.length; i++) {
            const childNode: VdomNode = parentNode.children[i];
            const childElement = this.domHandler.getElementFromNode(childNode);
            if(!childElement) {
                console.error('element not found', childNode, parentNode.children.length, i);
                continue;
            }
            const oldSelector = childElement['selector'];

            childElement['childIndex'] = i;
            childElement['parentSelector'] = parentSelector;
            childElement['selector'] = this.domHandler.combineElementSelectors(parentSelector, childNode.type, i+1);

            this.domHandler.updateNodeSelector(oldSelector, childElement['selector']);

            this.updateChildSelectors(childElement, childNode);
        }
    }

    private getNewRemoveChild(origRemoveChild: ((<T extends Node>(oldChild: T) => T)|(() => void)),
        skipUpdateSelectors = false) {
        const me = this;

        return function<T extends Node>(this: Element, el: T) {
            if(!this) {
                console.error('context not defined');
                return el;
            }
            if(!me.isWithinSvg(<Element> <any> el)) {
                return origRemoveChild.apply(this, arguments);
            }
            const parentNode = me.domHandler.getNodeFromElement(<Element> <any> this);
            const parentSelector = this['selector'];
            const node = me.domHandler.getNodeFromElement(<Element> <any> el);

            if(!node) {
                console.error('node not found', node, el, this, parentNode);
                return origRemoveChild.apply(this, arguments);
            }

            // Remove all child elements.
            for(const childNode of node.children) {
                const childEl = me.domHandler.getElementFromNode(childNode);
                //el.removeChild(childEl);
            }

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

            me.domHandler.removeNodeFromParent(<Element> <any> el, node);

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
        Element.prototype.removeChild = this.getNewRemoveChild(Element.prototype.removeChild);
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
            const parentSelector = me.domHandler.getElementSelector(this);
            if(parentSelector === null) {
                return origAppend.apply(this, arguments);
            }

            const parentNode = me.domHandler.getNodeFromElement(this);
            if(!parentNode) {
                return console.error('parent node not found', parentSelector, this);
            }
            let node: VdomNode;
            let keepChildren = false;

            if(el['parentSelector']) {
                node = me.domHandler.getVisNode(<Element> <any> el);

                me.getNewRemoveChild(() => {}).call(this, el);
                keepChildren = true; // If the element is being moved around, keep children.
            } else {
                node = me.domHandler.getNodeDataFromEl(<HTMLElement><any> el);
            }

            (el as any)['parentSelector'] = parentSelector;
            (el as any)['selector'] = me.domHandler.getElementSelector(<Element><any> el, parentNode);
            (el as any)['childIndex'] = parentNode.children.length;

            Object.defineProperty(el, 'style', {
                writable: true,
                value: {
                    setProperty: function(styleProp: string, value: string) {
                        me.domHandler.queueSetAttributeOnElement(el as any, 'style;' + styleProp, value);
                    },
                    getPropertyValue: function(styleProp) {
                        me.domHandler.enableFrontendDesignProperties();
                        return node.style[styleProp];
                    }
                }
            });

            Object.defineProperty(el, 'parentNode', {
                writable: true,
                value: this
            });
    
            me.domHandler.linkNodeToElement(node, el);
            me.domHandler.addNodeToParent(parentNode, node);
            me.updateChildSelectors(el as unknown as Element, node);
            
            if(me.useWorker) {
                me.enterExitQueue.push({
                    cmd: 'ENTER',
                    node: node,
                    parentNodeIndex: parentNode.globalElementIndex,
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
            me.domHandler.queueSetAttributeOnElement(this, name, value);
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
            me.domHandler.queueSetAttributeOnElement(this, name, value);
        };
    
        Element.prototype.getAttribute = function(name) {
            if(me.unassignedNodes.indexOf(this) !== -1) {
                return origGetAttr.apply(this, arguments);
            } else {
                try {
                    return me.domHandler.getAttributeFromSelector(this, name);
                } catch(e) {
                    console.error(e);
                    return origGetAttr.apply(this, arguments);
                }
            }
        };
    }
    
    private propagateMouseEvent(evt: MouseEvent, type?: string) {
        return this.propagateEvent(new MouseEvent(type? type : evt.type, evt));
    }

    private duplicateTouchEvent(evt: TouchEvent, type?: string) {
        const e = document.createEvent('TouchEvent');
        if(!type) {
            type = evt.type;
        }
        e.initEvent(type, true, false);
        for(const prop in evt) {
            if(prop !== 'isTrusted' && evt.hasOwnProperty(prop)) {
                Object.defineProperty(e, prop, {
                    writable: true,
                    value: evt[prop],
                });
            }
        }
        Object.defineProperty(e, 'type', {
            writable: true,
            value: type,
        });
        const touches = [];
        for(let i = 0; i < evt.touches.length; i++) {
            const touch = evt.touches[i];
            touches.push({identifier: touch.identifier, pageX: touch.pageX, pageY: touch.pageY,
                clientX: touch.clientX, clientY: touch.clientY});
        }
        Object.defineProperty(e, 'touches', {
            writable: true,
            value: touches,
        });
        return e;
    }

    private propagateTouchEvent(evt: TouchEvent, type?: string) {
        return this.propagateEvent(this.duplicateTouchEvent(evt, type));
    }
    
    private propagateWheelEvent(evt: WheelEvent) {
        return this.propagateEvent(new WheelEvent(evt.type, evt));
    }
    
    private propagateEvent(new_event: MouseEvent|TouchEvent|WheelEvent): undefined|Element {
        this.svg.dispatchEvent(new_event); // for EasyPZ

        let triggeredElement: undefined|Element;

        for(let interactionSel of this.interactionSelections)
        {
            let parentSelector = this.domHandler.getElementSelector(interactionSel);
            let parentNode = this.vdom.getVisNodeFromSelector(parentSelector);
            
            //let matchingVisParent = selectedNodes[i];
            let j = 1;
            
            if(!parentNode) {
                //console.error(interactionSel, parentSelector, parentNode);
            } else {
                for(let vdomNode of parentNode.children)
                {
                    const {x, y} = SSVG.getMousePosition(new_event);
                    let childNode = this.nodeAtPosition(vdomNode, x - 10, y - 10);
                    if(childNode)
                    {
                        //console.log(childNode);
                        /*let selector = parentSelector + ' > :nth-child(' + j + ')';
                        let svgEl = this.svg.querySelector(selector);*/
                        const svgEl = this.domHandler.getElementFromNode(vdomNode);
                        const svgChildEl = this.domHandler.getElementFromNode(childNode);

                        if(svgChildEl) {
                            Object.defineProperty(new_event, 'target', {
                                writable: true,
                                value: svgChildEl
                            });
                        }

                        if(svgChildEl) {
                            triggeredElement = svgChildEl;
                            svgChildEl.dispatchEvent(new_event);
                        }

                        if(svgEl && !triggeredElement) {
                            triggeredElement = svgEl;
                            svgEl.dispatchEvent(new_event);
                        }
                    }
                    j++;
                }
            }
        }
        return triggeredElement;
    }

    //TODO move this function somewhere else.
    private static getMousePosition(event: MouseEvent|TouchEvent) : {x: number, y: number}|null
    {
        let pos = {x: 0, y: 0};

        if(event.type.substr(0,5) === 'mouse' && event['clientX'])
        {
            pos = {x: event['clientX'], y: event['clientY']};
        }
        else if(event.type.substr(0,5) === 'touch')
        {
            const touches = event['touches'] ? event['touches'] : [];
            if(touches.length < 1) return null;
            pos = {x: touches[0].clientX, y: touches[0].clientY};
        }

        return pos;
    }
    
    private nodeAtPosition(visNode: VdomNode, x: number, y: number): false|VdomNode {
        if (visNode.type === 'circle') {
            let cx = visNode.cx || 0;
            let cy = visNode.cy || 0;
            if (visNode.transform) {
                const transform = DrawingUtils.parseTransform(visNode.transform);
                if (transform.translateX) {
                    cx += transform.translateX;
                }
                if (transform.translateY) {
                    cy += transform.translateY;
                }
            }
            const distance = Math.sqrt(Math.pow(cx - x, 2) + Math.pow(cy - y, 2));
            return distance < visNode.r ? visNode : false;
        } else if(visNode.type === 'rect' || visNode.type === 'image') {

            let elX = visNode.x || 0;
            let elY = visNode.y || 0;
            const width = visNode.width;
            const height = visNode.height;

            if (visNode.transform) {
                const transform = DrawingUtils.parseTransform(visNode.transform);
                if (transform.translateX) {
                    elX += transform.translateX;
                }
                if (transform.translateY) {
                    elY += transform.translateY;
                }
            }

            const centerX = elX + width / 2;
            const centerY = elY + height / 2;

            const distanceX = Math.abs(centerX - x);
            const distanceY = Math.abs(centerY - y);

            return distanceX < width / 2 && distanceY < height / 2 ? visNode : false;

        } else if(visNode.type === 'g') {

            const transform = this.domHandler.getTotalTransformation(visNode);
            if(transform.translateX) {
                x -= transform.translateX;
            }
            if(transform.translateY) {
                y -= transform.translateY;
            }

            let matchAny: false|VdomNode = false;
            for(let i = 0; i < visNode.children.length; i++) {
                if(this.nodeAtPosition(visNode.children[i], x, y)) {
                    matchAny = visNode.children[i];
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
