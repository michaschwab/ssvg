import VDom from "../util/vdom";

export default class Elementhandler {
    
    private vdom: VDom;
    private setAttrQueue: {[parentSelector: string]: { [attrName: string]: { [childIndex: number]: any }}} = {};
    
    constructor(private svg: SVGElement, private onNodesUpdated: (data: any) => void) {
        const visData: any = {
            width: this.svg.getAttribute('width'),
            height: this.svg.getAttribute('height'),
            scale: 1,
            children: []
        };
    
        this.vdom = new VDom(visData);
        
        window.setTimeout(() => {
            this.updateNodes();
            this.addChildNodesToVisData(this.svg.childNodes, this.vdom.data.children);
            
            this.svg.style.display = 'none';
    
            const recursiveRaf = () => {
                this.updateNodes();
                requestAnimationFrame(recursiveRaf);
            };
            requestAnimationFrame(recursiveRaf);
            
        }, 200);
    }
    
    getVDom() {
        return this.vdom;
    }
    
    queueSetAttributeOnElement(element: Element, attrName: string, value: any) {
        
        const parentSelector = (element as any)['parentSelector'] as string;
        const childIndex = (element as any)['childIndex'];
    
        attrName = this.checkAttrName(parentSelector, attrName);
    
        this.setAttrQueue[parentSelector][attrName][childIndex] = value;
    
        if(attrName === 'className') {
            this.updateNodes();
            // To apply classes immediately so styles can be applied correctly.
        }
    }
    
    queueSetAttributeOnSelection(selection, attrName, value) {
        const els = selection._groups[0];
        const parent = els[0].parentNode;
    
        const parentSelector = parent === this.svg ? "svg" : parent['selector'];
        
        if(!parentSelector) {
            safeLog(selection, parent);
            console.error('selector not found');
        }

        attrName = this.checkAttrName(parentSelector, attrName);
        
        for(let i = 0; i < els.length; i++) {
            const svgEl = els[i];
            
            this.setAttrQueue[parentSelector][attrName][i] =
                typeof value === "function" ? value(svgEl.__data__) : value;
            
            //safeLog(attrName, this.setAttrQueue[parentSelector][attrName][i])
        }

        if(attrName === 'className') {
            this.updateNodes();
            // To apply classes immediately so styles can be applied correctly.
        }
    }
    
    private checkAttrName(parentSelector, attrName) {
        if(attrName === 'class') {
            attrName = 'className';
        }
    
        if(!this.setAttrQueue[parentSelector]) {
            this.setAttrQueue[parentSelector] = {};
        }
        if(!this.setAttrQueue[parentSelector][attrName]) {
            this.setAttrQueue[parentSelector][attrName] = {};
        }

        return attrName;
    }
    
    private updateNodes() {
        
        //safeLog(this.setAttrQueue);
        
        this.onNodesUpdated({
            queue: this.setAttrQueue,
        });
        
        for(let parentSelector in this.setAttrQueue) {
            let parentNode = this.vdom.getVisNodeFromSelector(parentSelector);
            if(!parentNode) {
                console.error(parentNode, parentSelector);
                console.error(this.vdom.data);
            }
            
            for(let attrName in this.setAttrQueue[parentSelector]) {
                if(this.setAttrQueue[parentSelector].hasOwnProperty(attrName)) {
                    for(let childIndex in this.setAttrQueue[parentSelector][attrName]) {
                        try {
                            const childNode = parentNode.children[childIndex];
                            childNode[attrName] = this.setAttrQueue[parentSelector][attrName][childIndex];
                        } catch(e) {
                            safeErrorLog(e, parentNode, parentSelector, attrName, childIndex);
                            safeErrorLog(this.setAttrQueue);
                        }
                    }
                }
            }
        }
        
        this.setAttrQueue = {};
    }
    
    getAttributesFromSelector(selection, name: string) {
        const els = selection._groups[0];
        
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
    
    getNodeDataFromEl(el: HTMLElement) {
        const getRoundedAttr = (el: Element, attrName: string) => {
            const val = el.getAttribute(attrName);
            return val ? parseFloat(val) : null;
        };
        const win = document.defaultView || window;
        const style = win.getComputedStyle(el, '');
        
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
            text: !el.childNodes || (el.childNodes.length === 1 && !(el.childNodes[0] as HTMLElement).tagName) ? el.textContent : '',
            style: {
                /*stroke: style.getPropertyValue('stroke'),
                "stroke-opacity": parseFloat(style.getPropertyValue('stroke-opacity')),
                "stroke-width": parseFloat(style.getPropertyValue('stroke-width')),
                fill: style.getPropertyValue('fill'),
                textAnchor: style.textAnchor*/
            },
            children: []
        };
        
        return node;
    }
    
    applyStylesToNode(node: any) {
        for (let i = 0; i < document.styleSheets.length; i++){
            const rules = (document.styleSheets[i] as any).rules as CSSRuleList;
            
            for(let j = 0; j < rules.length; j++) {
                const rule = rules[j] as any;
                
                const selector = rule.selectorText as string;
                this.applyRuleToNode(node, selector, rule);
            }
        }
    }
    
    private applyRuleToNode(node: any, selector: string, rule: any): boolean {
        
        selector = selector
            .replace(' >', '>')
            .replace('> ', '>')
            .replace('svg>', '');
        
        const selectorPartsLooseStrict = selector.split(' ')
            .map(part => part.split('>'));
        /*if(node.type === 'circle' && selectorPartsLooseStrict[0][0] === '.nodes') {
            console.log(selectorPartsLooseStrict);
        }*/
        
        const checkNode = (currentNode: any, looseIndex = 0, strictIndex = 0): boolean => {
            const selPart = selectorPartsLooseStrict[looseIndex][strictIndex];
            let partialMatch = false;
            
            for(let child of currentNode.children) {
                if(selPart[0] === '.') {
                    if(selPart.substr(1) === child.className) {
                        partialMatch = true;
                    }
                } else {
                    if(selPart === child.type) {
                        partialMatch = true;
                    }
                }
                /*if(node.type === 'circle' && selectorPartsLooseStrict[0][0] === '.nodes') {
                    console.log(selPart, partialMatch, child, selPart[0] === '.', selPart.substr(1), child.className);
                }*/
                if(partialMatch) {
                    if(selectorPartsLooseStrict[looseIndex].length > strictIndex + 1) {
                        checkNode(child, looseIndex, strictIndex + 1);
                    } else if(selectorPartsLooseStrict.length > looseIndex + 1) {
                        checkNode(child, looseIndex + 1, strictIndex);
                    } else {
                        /*if(child.type === 'circle') {
                            console.log(child === node, child, node);
                        }*/
                        //console.log(child === node, child, node);
                        if(child === node) {
                            //console.log('applying styles');
                            if(rule.style.stroke) {
                                child.style.stroke = rule.style.stroke;
                            }
                            if(rule.style['stroke-opacity']) {
                                child.style['stroke-opacity'] = parseFloat(rule.style['stroke-opacity']);
                            }
                            if(rule.style['stroke-width']) {
                                child.style['stroke-width'] = parseFloat(rule.style['stroke-width']);
                            }
                        }
                    }
                }
            }
            return false;
        };
        
        return checkNode(this.vdom.data);
    }
    
    private applyStyles() {
        for (let i = 0; i < document.styleSheets.length; i++){
            const rules = (document.styleSheets[i] as any).rules as CSSRuleList;
            
            for(let j = 0; j < rules.length; j++) {
                const rule = rules[j] as any;
                
                const selector = rule.selectorText as string;
                this.applyRuleToMatchingNodes(selector, rule); //TODO
            }
        }
    }
    
    private applyRuleToMatchingNodes(selector: string, rule: any): boolean {
        
        selector = selector
            .replace(' >', '>')
            .replace('> ', '>')
            .replace('svg>', '');
        
        const selectorPartsLooseStrict = selector.split(' ')
            .map(part => part.split('>'));
        
        const checkNode = (currentNode: any, looseIndex = 0, strictIndex = 0): boolean => {
            const selPart = selectorPartsLooseStrict[looseIndex][strictIndex];
            let partialMatch = false;
            
            for(let child of currentNode.children) {
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
                        if(rule.style.stroke) {
                            child.style.stroke = rule.style.stroke;
                        }
                        if(rule.style['stroke-opacity']) {
                            child.style['stroke-opacity'] = parseFloat(rule.style['stroke-opacity']);
                        }
                        if(rule.style['stroke-width']) {
                            child.style['stroke-width'] = parseFloat(rule.style['stroke-width']);
                        }
                    }
                }
            }
            return false;
        };
        
        return checkNode(this.vdom.data);
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
                //console.log(element, node, parentSelector, index);
                sel = parentSelector + ' > ' + name + ':nth-child(' + index + ')';
            }
            
            //console.log(element, sel);
            
            //let parentSelector = element['parentSelector'] ? element['parentSelector'] as string : '';
            
            return sel;
        }
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