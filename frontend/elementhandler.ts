import VDom from "../util/vdom";

export default class Elementhandler {
    
    private vdom: VDom;
    private sharedArrays: {[parentSelector: string]: { [attrName: string]: Int32Array}} = {};
    private setAttrQueue: {[parentSelector: string]: { [attrName: string]: (string[]|SharedArrayBuffer)}} = {};
    private addedNodesWithoutApplyingStyles = false;
    private nodesToElements: { nodes: any[], elements: any[]} = { nodes: [], elements: []};
    
    constructor(private svg: SVGElement, private onUpdateNeeded: () => void) {
        const visData: any = {
            width: this.svg.getAttribute('width'),
            height: this.svg.getAttribute('height'),
            scale: 1,
            children: []
        };
    
        this.vdom = new VDom(visData);
        this.svg.style.display = 'none';
        
        window.setTimeout(() => {
            this.addChildNodesToVisData(this.svg.childNodes, this.vdom.data.children);
        }, 100);
    }
    
    getVDom() {
        return this.vdom;
    }
    
    queueSetAttributeOnElement(element: Element, attrName: string, value: any) {
        //TODO: merge with updatePropertiesFromQueue from VDom?
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
        }
    
        attrName = this.checkAttrName(parentSelector, attrName);
        this.setAttrQueue[parentSelector][attrName][childIndex] = value;
    
        if(attrName === 'className') {
            this.onUpdateNeeded();
            // To apply classes immediately so styles can be applied correctly.
        }
    }
    
    queueSetAttributeOnSelection(elements, attrName, value) {
        if(!elements.length) return;
        
        const parent = elements[0].parentNode;
        let parentSelector = parent === this.svg ? "svg" : parent['selector'];
        
        if(!parentSelector) {
            safeLog(elements, parent);
            console.error('selector not found');
        }

        attrName = this.checkAttrName(parentSelector, attrName);
        
        for(let i = 0; i < elements.length; i++) {
            const svgEl = elements[i];
            
            const evaluatedValue = typeof value === "function" ? value(svgEl.__data__, i) : value;
            if(this.useSharedArrayFor.indexOf(attrName) === -1) {
                this.setAttrQueue[parentSelector][attrName][i] = evaluatedValue;
            } else {
                this.sharedArrays[parentSelector][attrName][i] = evaluatedValue * 10; // For precision.
            }
            
            //safeLog(attrName, this.setAttrQueue[parentSelector][attrName][i])
        }

        if(attrName === 'className') {
            this.onUpdateNeeded();
            // To apply classes immediately so styles can be applied correctly.
        }
    }
    
    private useSharedArrayFor = ['cx', 'cy', 'x1', 'x2', 'y1', 'y2'];
    
    private checkAttrName(parentSelector, attrName) {
        if(attrName === 'class') {
            attrName = 'className';
        }
    
        if(!this.setAttrQueue[parentSelector]) {
            this.setAttrQueue[parentSelector] = {};
            this.sharedArrays[parentSelector] = {};
        }
        if(!this.setAttrQueue[parentSelector][attrName]) {
            if(this.useSharedArrayFor.indexOf(attrName) === -1) {
                this.setAttrQueue[parentSelector][attrName] = [];
            } else {
                const length = 10000;
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
            return console.error('trying to get attribute for unfit selection', node);
        }
        
        return node[name];
    }
    
    private getVisNode(element: Element): any|null {
        const selector = this.getElementSelector(element);
        
        return this.vdom.getVisNodeFromSelector(selector);
    }
    
    getNodeDataFromEl(el: HTMLElement): {type: string; [attr: string]: any} {
        const getRoundedAttr = (el: Element, attrName: string) => {
            const val = el.getAttribute(attrName);
            return val ? parseFloat(val) : null;
        };
        
        const node = {
            type: el.tagName.toLowerCase(),
            transform: el.getAttribute('transform'),
            d: el.getAttribute('d'),
            className: el.getAttribute('class'),
            r: el.getAttribute('r'),
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
            let partialMatch = false;

            for(let childIndex = 0; childIndex < currentNode.children.length; childIndex++) {
                const child = currentNode.children[childIndex];
                if(selPart[0] === '.') {
                    if(selPart.substr(1) === child.className) {
                        partialMatch = true;
                    }
                } else {
                    if(selPart === child.type) {
                        partialMatch = true;
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
                            //child.style.stroke = rule.style.stroke;
                            this.checkAttrName(parentSelector, 'style;stroke');
                            this.setAttrQueue[parentSelector]['style;stroke'][childIndex] = rule.style.stroke;
                        }
                        if(rule.style['stroke-opacity']) {
                            //child.style['stroke-opacity'] = parseFloat(rule.style['stroke-opacity']);
                            this.checkAttrName(parentSelector, 'style;stroke-opacity');
                            this.setAttrQueue[parentSelector]['style;stroke-opacity'][childIndex] = rule.style['stroke-opacity'];
                        }
                        if(rule.style['stroke-width']) {
                            //child.style['stroke-width'] = parseFloat(rule.style['stroke-width']);
                            this.checkAttrName(parentSelector, 'style;stroke-width');
                            this.setAttrQueue[parentSelector]['style;stroke-width'][childIndex] = rule.style['stroke-width'];
                        }
                        if(rule.style['fill-opacity']) {
                            //child.style['stroke-opacity'] = parseFloat(rule.style['stroke-opacity']);
                            this.checkAttrName(parentSelector, 'style;fill-opacity');
                            this.setAttrQueue[parentSelector]['style;fill-opacity'][childIndex] = rule.style['fill-opacity'];
                        }
                    }
                }
            }
            return false;
        };

        return checkNode(this.vdom.data);
    }

    addNodeToParent(parentNode, node) {
        parentNode.children.push(node);
        this.addedNodesWithoutApplyingStyles = true;
    }
    
    private addChildNodesToVisData(childEls: HTMLElement[]|NodeList, childrenData: any): void {
        
        for(let i  = 0; i < childEls.length; i++) {
            let el = childEls[i] as HTMLElement;
            
            try
            {
                const node = this.getNodeDataFromEl(el);
                //console.log(node);
                
                childrenData.push(node);
                
                if(el.childNodes)
                {
                    this.addChildNodesToVisData(el.childNodes, node.children);
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
        this.addedNodesWithoutApplyingStyles = true;
    }

    getNodeSelector(node: any): string {
        return this.getElementSelector(this.getElementFromNode(node));
    }
    
    getElementSelector(element: Element): string {
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
                
                let node = this.vdom.getVisNodeFromSelector(parentSelector);
                if(!node) {
                    console.error(parentSelector, parentSelector.length, this.vdom.data);
                }
                const index = node.children.length + 1;
                let name = element.localName;
                if (!name) {
                    console.error(node);
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
        this.nodesToElements.elements.push(element);
    }

    getElementFromNode(node) {
        const nodeIndex = this.nodesToElements.nodes.indexOf(node);
        return this.nodesToElements.elements[nodeIndex];
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