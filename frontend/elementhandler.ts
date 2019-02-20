import {VdomManager, VdomNode, VdomNodeType} from "../util/vdomManager";

export default class Elementhandler {
    
    private vdom: VdomManager;
    private sharedArrays: {[parentSelector: string]: { [attrName: string]: Int32Array}} = {};
    private setAttrQueue: {[parentSelector: string]: { [attrName: string]: (string[]|SharedArrayBuffer)}} = {};
    private addedNodesWithoutApplyingStyles = false;
    private nodesToElements: { nodes: VdomNode[], elements: Element[]} = { nodes: [], elements: []};
    
    constructor(private svg: SVGElement, private onUpdateNeeded: () => void) {
        const visData: any = {
            width: this.svg.getAttribute('width'),
            height: this.svg.getAttribute('height'),
            scale: 1,
            children: []
        };
    
        this.vdom = new VdomManager(visData);
        this.svg.style.display = 'none';

        this.addChildNodesToVisData(this.svg.childNodes, this.vdom.data);

        window.setTimeout(() => {
            this.addedNodesWithoutApplyingStyles = true; // Re-do the styles.
        }, 100);
    }
    
    getVDom() {
        return this.vdom;
    }
    
    queueSetAttributeOnElement(element: Element, attrName: string, value: any) {
        //TODO: merge with updatePropertiesFromQueue from VdomManager?
        const parent = element.parentNode;
        let parentSelector = parent === this.svg ? "svg" : (element as any)['parentSelector'] as string;
        let childIndex = (element as any)['childIndex'];
    
        if(!parentSelector && element === this.svg) {
            parentSelector = 'SVG_PARENT';
            childIndex = 0;
        }
    
        if(!parentSelector) {
            safeLog(element, parent);
            console.error('selector not found');
            return;
        }

        attrName = this.checkAttrName(parentSelector, attrName, false);
        const evaluatedValue = typeof value === "function" ? value((<any> element).__data__, childIndex) : value;
        this.setAttrQueue[parentSelector][attrName][childIndex] = evaluatedValue;

        if(attrName === 'className') {
            this.onUpdateNeeded();
            // To apply classes immediately so styles can be applied correctly.
        }
    }
    
    queueSetAttributeOnSelection(elements, attrName, value) {
        if(!elements.length) return;
        if(!elements[0]) {
            //console.error('selection elements not found', elements);
            return;
        }
        
        for(let i = 0; i < elements.length; i++) {
            const svgEl = elements[i];
            const indexOfParent = svgEl.childIndex;

            const parent = elements[i].parentNode;
            let parentSelector = parent === this.svg ? "svg" : parent['selector'];

            if(!parentSelector) {
                safeLog(elements, parent);
                console.error('selector not found');
            }

            attrName = this.checkAttrName(parentSelector, attrName, true);

            const evaluatedValue = typeof value === "function" ? value(svgEl.__data__, i) : value;
            if(this.useSharedArrayFor.indexOf(attrName) === -1) {
                this.setAttrQueue[parentSelector][attrName][indexOfParent] = evaluatedValue;
            } else {
                this.sharedArrays[parentSelector][attrName][indexOfParent] = evaluatedValue * 10; // For precision.
            }
            
            //safeLog(attrName, this.setAttrQueue[parentSelector][attrName][i])
        }

        if(attrName === 'className') {
            this.onUpdateNeeded();
            // To apply classes immediately so styles can be applied correctly.
        }
    }
    
    private useSharedArrayFor = ['cx', 'cy', 'x1', 'x2', 'y1', 'y2'];
    
    private checkAttrName(parentSelector: string, attrName: string, useBuffer = false) {
        if(attrName === 'class') {
            attrName = 'className';
        }

        if(!this.setAttrQueue[parentSelector]) {
            this.setAttrQueue[parentSelector] = {};
            this.sharedArrays[parentSelector] = {};
        }

        if(!useBuffer || this.useSharedArrayFor.indexOf(attrName) === -1) {
            if(!this.setAttrQueue[parentSelector][attrName]) {
                this.setAttrQueue[parentSelector][attrName] = [];
            }
        } else {
            if(!this.sharedArrays[parentSelector][attrName]) {
                const length = this.vdom.getParentNodeFromSelector(parentSelector).children.length;
                const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * length);

                this.setAttrQueue[parentSelector][attrName] = buffer;
                this.sharedArrays[parentSelector][attrName] = new Int32Array(buffer);
            }
        }

        return attrName;
    }
    
    useAttrQueue(cb: (data) => void = () => {}) {
        if(this.addedNodesWithoutApplyingStyles) {
            this.addedNodesWithoutApplyingStyles = false;
            this.applyStyles();
        }
        
        cb(this.setAttrQueue);
        this.vdom.updatePropertiesFromQueue(this.setAttrQueue);
        
        this.setAttrQueue = {};
    }
    
    getAttributesFromSelector(selection, name: string) {
        // Dealing with d3 v3.
        const els = selection._groups ? selection._groups[0] : selection[0];
        
        return els.map(el => this.getAttributeFromSelector(el, name));
    }
    
    getAttributeFromSelector(element: Element, name: string) {
        const node = this.getVisNode(element);
        
        if(!node) {
            throw Error('element not found');
            //return console.error('trying to get attribute for unfit selection', node, element, name);
        }
        
        return node[name];
    }
    
    getVisNode(element: Element): any|null {
        const selector = this.getElementSelector(element);

        if(selector === null) {
            return null;
        }
        
        return this.vdom.getVisNodeFromSelector(selector);
    }
    
    getNodeDataFromEl(el: HTMLElement): VdomNode {
        const getRoundedAttr = (el: Element, attrName: string) => {
            const val = el.getAttribute(attrName);
            return val ? parseFloat(val) : null;
        };
        
        const node = {
            type: el.tagName.toLowerCase() as VdomNodeType,
            transform: el.getAttribute('transform'),
            d: el.getAttribute('d'),
            className: el.getAttribute('class'),
            id: el.getAttribute('id'),
            r: getRoundedAttr(el, 'r'),
            fill: el.getAttribute('fill'),
            cx: getRoundedAttr(el, 'cx'),
            cy: getRoundedAttr(el, 'cy'),
            x: getRoundedAttr(el, 'x'),
            y: getRoundedAttr(el, 'y'),
            x1: getRoundedAttr(el, 'x1'),
            x2: getRoundedAttr(el, 'x2'),
            y1: getRoundedAttr(el, 'y1'),
            y2: getRoundedAttr(el, 'y2'),
            "stroke-width": getRoundedAttr(el, 'stroke-width'),
            text: !el.childNodes || (el.childNodes.length === 1 && !(el.childNodes[0] as HTMLElement).tagName) ? el.textContent : undefined,
            style: {},
            children: []
        };
        
        const clean = obj => {
            const propNames = Object.getOwnPropertyNames(obj);
            for (let i = 0; i < propNames.length; i++) {
                const propName = propNames[i];
                if (obj[propName] === null || obj[propName] === undefined) {
                    delete obj[propName];
                }
            }
        };
        
        clean(node);
        
        return node;
    }
    
    private applyStyles() {
        for (let i = 0; i < document.styleSheets.length; i++) {
            const sheet = document.styleSheets[i] as any;
            const rules = (sheet.rules ? sheet.rules : sheet.cssRules) as CSSRuleList;
        
            for (let j = 0; j < rules.length; j++) {
                const rule = rules[j] as any;
                const selector = rule.selectorText as string;
                if(!selector) {
                    continue; // Skip @imports etc.
                }
                this.applyRuleToMatchingNodes(selector, rule); //TODO
            }
        }
    }

    private applyRuleToMatchingNodes(selectorString: string, rule: any): boolean {

        selectorString = selectorString.trim();

        const selector = selectorString
            .replace(' >', '>')
            .replace('> ', '>')
            .replace('svg>', '');
        
        const selectorPartsLooseStrict = selector.split(' ')
            .map(part => part.split('>'));
        
        const checkNode = (currentNode: any, looseIndex = 0, strictIndex = 0): boolean => {
            const selPart = selectorPartsLooseStrict[looseIndex][strictIndex];
            
            for(let childIndex = 0; childIndex < currentNode.children.length; childIndex++) {
                const child = currentNode.children[childIndex];
                let partialMatch = false;
                if(selPart[0] === '.') {
                    if(selPart.substr(1) === child.className) {
                        partialMatch = true;
                    }
                } else {
                    if(selPart.indexOf('.') === -1) {
                        if(selPart === child.type) {
                            partialMatch = true;
                        }
                    } else {
                        const cutoff = selPart.indexOf('.');
                        const typeName = selPart.substr(0, cutoff);
                        const className = selPart.substr(cutoff + 1);
                        if(typeName === child.type && className === child.className) {
                            partialMatch = true;
                        }
                    }
                }
                if(partialMatch) {
                    
                    if(selectorPartsLooseStrict[looseIndex].length > strictIndex + 1) {
                        checkNode(child, looseIndex, strictIndex + 1);
                    } else if(selectorPartsLooseStrict.length > looseIndex + 1) {
                        checkNode(child, looseIndex + 1, strictIndex);
                    } else {
                        const parentSelector = this.getNodeSelector(currentNode);
                        //safeLog(selectorString, parentSelector);

                        if(rule.style.stroke) {
                            this.checkAttrName(parentSelector, 'style;stroke');
                            if(!this.setAttrQueue[parentSelector]['style;stroke'][childIndex] && !child.style.stroke) {
                                this.setAttrQueue[parentSelector]['style;stroke'][childIndex] = rule.style.stroke;
                            }
                        }
                        if(rule.style['stroke-opacity']) {
                            this.checkAttrName(parentSelector, 'style;stroke-opacity');
                            if(!this.setAttrQueue[parentSelector]['style;stroke-opacity'][childIndex] && !child.style['stroke-opacity']) {
                                this.setAttrQueue[parentSelector]['style;stroke-opacity'][childIndex] = rule.style['stroke-opacity'];
                            }
                        }
                        if(rule.style['stroke-width']) {
                            this.checkAttrName(parentSelector, 'style;stroke-width');
                            if(!this.setAttrQueue[parentSelector]['style;stroke-width'][childIndex] && !child.style['stroke-width']) {
                                this.setAttrQueue[parentSelector]['style;stroke-width'][childIndex] = rule.style['stroke-width'];
                            }
                        }
                        if(rule.style['fill-opacity']) {
                            this.checkAttrName(parentSelector, 'style;fill-opacity');
                            if(!this.setAttrQueue[parentSelector]['style;fill-opacity'][childIndex] && !child.style['fill-opacity']) {
                                this.setAttrQueue[parentSelector]['style;fill-opacity'][childIndex] = rule.style['fill-opacity'];
                            }
                        }
                        if(rule.style['fill']) {
                            this.checkAttrName(parentSelector, 'style;fill');
                            if(!this.setAttrQueue[parentSelector]['style;fill'][childIndex] && !child.style['fill']) {
                                this.setAttrQueue[parentSelector]['style;fill'][childIndex] = rule.style['fill'];
                            }
                        }
                    }
                } else {
                    checkNode(child, looseIndex, strictIndex);
                }
            }
            return false;
        };

        return checkNode(this.vdom.data);
    }

    removeNodeFromParent(element: Element, node: any) {
        this.vdom.removeNode(element['childIndex'], element['parentSelector']);
        let index = this.nodesToElements.nodes.indexOf(node);
        if(index === -1) {
            return console.error('node not found', node);
        }

        this.nodesToElements.nodes.splice(this.nodesToElements.nodes.indexOf(node), 1);
        this.nodesToElements.elements.splice(this.nodesToElements.elements.indexOf(element), 1);
    }

    addNodeToParent(parentNode, node) {
        parentNode.children.push(node);
        this.addedNodesWithoutApplyingStyles = true;
    }
    
    private addChildNodesToVisData(childEls: HTMLElement[]|NodeList, parentNode: VdomNode): void {
        const parentEl = this.getElementFromNode(parentNode);

        for(let i  = 0; i < childEls.length; i++) {
            let el = childEls[i] as HTMLElement;
            
            try
            {
                const node = this.getNodeDataFromEl(el);

                (el as any)['parentSelector'] = this.getElementSelector(parentEl);
                (el as any)['selector'] = this.getElementSelector(<Element><any> el);
                (el as any)['childIndex'] = parentNode.children.length;

                parentNode.children.push(node);
                this.linkNodeToElement(node, el);
                
                if(el.childNodes)
                {
                    this.addChildNodesToVisData(el.childNodes, node);
                }
                if(node.type === 'tspan')
                {
                    //console.log(node, el, el.childNodes, el.textContent);
                    //console.log(el.childNodes[0])
                    //console.log(node, style.textAnchor);
                }
                if(node.type === 'text')
                {
                    //console.log(node, el, el.childNodes, el.textContent);
                }
            }
            catch(e)
            {
                //console.log(e);
                //console.log(el);
            }
        }
        if(childEls.length) {
            this.addedNodesWithoutApplyingStyles = true;
        }
    }

    getNodeSelector(node: any): string {
        if(node === this.vdom.data) {
            return 'svg';
        }
        const element = this.getElementFromNode(node);
        if(!element) {
            console.error('could not find element for node ', node);
            return '';
        }
        return this.getElementSelector(element, node);
    }
    
    getElementSelector(element: Element, node?: any): string|null {
        let sel = (element as any)['selector'];
        
        if(sel)
        {
            return sel;
        }
        else
        {
            if(element === this.svg) {
                sel = 'svg';
            } else {
                let parentSelector = (element as any)['parentSelector'] ?
                    (element as any)['parentSelector'] as string : '';
                
                let parentNode = this.vdom.getVisNodeFromSelector(parentSelector);
                if(!parentNode) {
                    console.warn('Element not found', element, parentSelector, parentSelector.length, this.vdom.data);
                    return null;
                }
                let index = parentNode.children.length + 1;
                if(node && parentNode.children.indexOf(node) !== -1) {
                    index = parentNode.children.indexOf(node) + 1;
                }
                let name = element.localName;
                if (!name) {
                    console.error(parentNode);
                    throw Error('name is null');
                }
                name = name.toLowerCase();
                sel = parentSelector + ' > ' + name + ':nth-child(' + index + ')';
            }
            
            return sel;
        }
    }

    linkNodeToElement(node, element: Node) {
        this.nodesToElements.nodes.push(node);
        this.nodesToElements.elements.push(element as Element);
    }

    getElementFromNode(node) {
        if(node === this.vdom.data) {
            return this.svg;
        }
        const nodeIndex = this.nodesToElements.nodes.indexOf(node);
        if(nodeIndex === -1) {
            console.error('node not found', node, this.nodesToElements.nodes, this.nodesToElements.nodes.length);
        }
        return this.nodesToElements.elements[nodeIndex];
    }

    getNodeFromElement(element: Element) {
        const elementIndex = this.nodesToElements.elements.indexOf(element);
        return this.nodesToElements.nodes[elementIndex];
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