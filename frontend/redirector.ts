import {Domhandler, SsvgElement} from "./domhandler";
import {VdomManager} from "../util/vdom/vdom-manager";
import {VdomNode} from "../util/vdom/vdom";
import {Interactionhandler} from "./interactionhandler";

export class Redirector {
    private unassignedNodes: Node[] = [];

    constructor(private svg: SVGElement & SsvgElement,
                private domHandler: Domhandler,
                private vdom: VdomManager,
                private interactions: Interactionhandler,
                private onSvgSizeSet: () => void,
                private onAddNode: (node: VdomNode, parentNode: VdomNode, keepChildren: boolean) => void,
                private onRemoveNode: (node: VdomNode, parentNode: VdomNode) => void,
                private onSvgAppended: (svgEl: SVGElement & SsvgElement) => void,
                private svgIsAssignedAndSizeSet: () => boolean) {
        this.captureD3On();
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
                let isWithinSvg = me.domHandler.isWithinSvg(el);

                if(isWithinSvg) {
                    me.interactions.captureD3On(el);
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
                        if(selector === 'body') {
                            return original.apply(this, arguments);
                        }
                        let elements: SsvgElement[];
                        if(this === d3) {
                            elements = [me.svg];
                        } else {
                            elements = this._groups ? this._groups[0] : this[0];
                        }

                        if(!elements.filter(e => e).length) {
                            safeLog('element not found within svg, using normal execution', this, selector);
                            return original.apply(this, arguments);
                        }

                        let childElements: SsvgElement[] = [];

                        for(let i = 0; i < elements.length; i++) {
                            const element = elements[i];
                            const node = me.domHandler.getVisNode(element);

                            if(!node) {
                                console.warn('node not found', element);
                                return original.apply(this, arguments);
                            }

                            const childNodes = me.vdom.getVisNodesFromSelector(node, selector);
                            childElements = childElements.concat(childNodes.map(node => {
                                return me.domHandler.getElementFromNode(node);
                            }));
                        }

                        const returnValue = original.apply(this, arguments);
                        const elementsOutsideSvg: NodeList = returnValue._groups ? returnValue._groups[0]
                            : returnValue[0];
                        elementsOutsideSvg.forEach(childNode => {
                            const childEl = <SsvgElement> <any> childNode;
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

        window.getComputedStyle = function(element: SsvgElement) {
            if(element && !me.domHandler.isWithinSvg(element) && (<Window> <any> element) !== window) {
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

        Element.prototype.querySelector = function(this: SsvgElement, selector: string) {
            if(!me.domHandler.isWithinSvg(this)) {
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
                        if(els[0] && !me.domHandler.isWithinSvg(els[0])) {
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
                            parentNode = me.domHandler.getVisNode(parentElement);
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
                        if(!me.domHandler.isWithinSvg(element)) {
                            return originalFct.apply(this, arguments);
                        }
                        me.domHandler.queueSetAttributeOnElement(element, prefix + name, value);
                    } else {
                        if(!me.domHandler.isWithinSvg(elements[0])) {
                            return originalFct.apply(this, arguments);
                        }
                        me.domHandler.queueSetAttributeOnSelection(filteredElements, prefix + name, value);
                    }

                    if(filteredElements[0] === me.svg && (name === 'width' || name === 'height')) {
                        me.vdom.data[name] = parseInt(value);
                        me.onSvgSizeSet();
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
                    let i = -1;
                    for(let element of elements) {
                        i++;
                        if(element) {
                            const node = me.domHandler.getNodeFromElement(element);
                            if(!node) {
                                console.warn('node not found', element);
                                continue;
                            }
                            const prevClassNames = node.className || '';
                            const evaluatedValue = typeof value === "function" ? value(element.__data__, i) : value;
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
            d3.selection.prototype.text = function(value?: (number|string|((el: HTMLElement) => (number|string)))) {
                if(value !== undefined) {
                    let elements = this._groups ? this._groups[0] : this[0];
                    let i = 0;
                    for(let element of elements) {
                        if(element && me.domHandler.isWithinSvg(element)) {
                            me.domHandler.queueSetAttributeOnElement(element, 'text', value);
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

            const newRemove = this.getNewRemoveChild(() => {}, true);
            const d3Remove = function() {
                let elements = this._groups ? this._groups[0] : this[0];

                if(elements.length) {
                    let parentElement: SsvgElement = null;
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

    private getNewRemoveChild(origRemoveChild: ((<T extends Node>(oldChild: T) => T)|(() => void)),
                              skipUpdateSelectors = false) {
        const me = this;

        return function<T extends Node>(this: SsvgElement, el: T & SsvgElement) {
            if(!this) {
                console.error('context not defined');
                return el;
            }
            if(!me.domHandler.isWithinSvg(el)) {
                return origRemoveChild.apply(this, arguments);
            }
            const parentNode = me.domHandler.getNodeFromElement(this);
            const node = me.domHandler.getNodeFromElement(el);

            if(!node) {
                console.error('node not found', node, el, this, parentNode);
                return origRemoveChild.apply(this, arguments);
            }

            // Remove all child elements.
            /*for(const childNode of node.children) {
                const childEl = me.domHandler.getElementFromNode(childNode);
                el.removeChild(childEl);
            }*/

            // Remove from current parent first.
            Object.defineProperty(el, 'parentNode', {
                writable: true,
                value: undefined
            });

            //console.log('remove')
            /*me.enterExitQueue.push({
                cmd: 'EXIT',
                childGlobalIndex: el.globalElementIndex,
                parentGlobalIndex: parentNode.globalElementIndex
            });*/
            me.onRemoveNode(node, parentNode);

            me.domHandler.removeNode(el, node, parentNode);

            // Fix child indices of all children.
            if(!skipUpdateSelectors) {
                if(!parentNode) {
                    console.error('parent not found', parentNode, this, el);
                }
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

        return function<T extends Node>(this: SsvgElement, el: T & SsvgElement) {
            if(!me.svgIsAssignedAndSizeSet) {
                if(!me.svg && el.tagName === 'svg') {
                    const appended = origAppend.apply(this, arguments);
                    me.onSvgAppended(<SVGElement & SsvgElement> <unknown> el);
                    return appended;

                } else {
                    return origAppend.apply(this, arguments);
                }
            }

            if(!me.domHandler.isWithinSvg(this)) {
                return origAppend.apply(this, arguments);
            }

            Object.defineProperty(el, 'ownerSVGElement', {
                writable: true,
                value: me.svg
            });
            el['appendChild'] = <T extends Node>(el2: T) => {
                return me.getNewAppendChild(origAppend).call(el, el2);
            };

            const parentNode = me.domHandler.getNodeFromElement(this);
            if(!parentNode) {
                return console.error('parent node not found', this);
            }
            let node: VdomNode;
            let keepChildren = false;

            if(el.globalElementIndex) {
                node = me.domHandler.getVisNode(el);

                me.getNewRemoveChild(() => {}).call(this, el);
                keepChildren = true; // If the element is being moved around, keep children.
            } else {
                node = me.domHandler.getNodeDataFromEl(el);
            }

            Object.defineProperty(el, 'style', {
                writable: true,
                value: {
                    setProperty: function(styleProp: string, value: string) {
                        me.domHandler.queueSetAttributeOnElement(el, 'style;' + styleProp, value);
                    },
                    getPropertyValue: function(styleProp) {
                        me.domHandler.enableFrontendDesignProperties();
                        return node.style[styleProp];
                    },
                    removeProperty: function() {
                        console.log('remove property not yet implemented.');
                        //TODO implement removeProperty CSS function.
                    }
                }
            });

            Object.defineProperty(el, 'parentNode', {
                writable: true,
                value: this
            });

            me.domHandler.linkNodeToElement(node, el);
            me.vdom.addNodeToParent(node, parentNode.globalElementIndex);
            me.domHandler.restyleNode(node);

            me.onAddNode(node, parentNode, keepChildren);
            /*if(me.useWorker) {
                me.enterExitQueue.push({
                    cmd: 'ENTER',
                    node: node,
                    parentGlobalIndex: parentNode.globalElementIndex,
                    keepChildren: keepChildren
                });
            } else {
                if(me.renderer.addNode) {
                    me.renderer.addNode(node);
                }
            }*/

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
            //TODO: Add insertBefore.
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
            if(me.domHandler.isWithinSvg(this)) {
                const d = this.getAttribute('d');
                me.origSetAttribute.call(this, 'd', d);
            }

            return origGetTotalLength.apply(this, arguments);
        };
    }

    private origSetAttribute;

    private replaceNativeAttribute() {
        this.origSetAttribute = Element.prototype.setAttribute;
        const me = this;

        const getNewSetAttr = origSetAttr => {
            return function(this: SsvgElement, name: string, value: any) {
                if(name === 'easypz' || me.unassignedNodes.indexOf(this) !== -1) {
                    // Update the original SVG
                    origSetAttr.apply(this, arguments);
                    return;
                }
                if(name === 'class') {
                    origSetAttr.apply(this, arguments);
                }
                if(!me.domHandler.isWithinSvg(this)) {
                    return origSetAttr.apply(this, arguments);
                }
                me.domHandler.queueSetAttributeOnElement(this, name, value);
            };
        }

        Element.prototype.setAttribute = getNewSetAttr(Element.prototype.setAttribute);
        Element.prototype.setAttributeNS = getNewSetAttr(Element.prototype.setAttributeNS);

        //TODO: Figure out how to access the element when setting a style property.
        /*CSSStyleDeclaration.prototype.setProperty = function(name: string, value: any) {
            safeLog(this, arguments);
            me.elementHandler.queueSetAttributeOnElement(this, 'style;' + name, value);
        };*/

        const origGetAttr = Element.prototype.getAttribute;
        Element.prototype.getAttribute = function(this: SsvgElement, name) {
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
}

let safeLogCount = 0;
function safeLog(...logContents) {

    if(safeLogCount < 200) {
        safeLogCount++;
        console.log(...logContents);
    }
}
function safeErrorLog(...logContents) {

    if(safeLogCount < 200) {
        safeLogCount++;
        console.error(...logContents);
    }
}
