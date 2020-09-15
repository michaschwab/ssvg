import {VdomNode, VdomNodeType} from "../util/vdom/vdom";
import SetPropertyQueue from "../util/vdom/set-property-queue";
import {VdomManager} from "../util/vdom/vdom-manager";
import DrawingUtils, {Transformation} from "../canvasworker/drawingUtils";
import drawingUtils from "../canvasworker/drawingUtils";

export default class Domhandler {
    private readonly vdom: VdomManager;
    private setAttrQueue = new SetPropertyQueue();
    private nodesToElements: { nodes: VdomNode[], elements: Element[]} = { nodes: [], elements: []};
    private nodesToRestyle: VdomNode[] = [];

    constructor(private svg: SVGElement, useWorker: boolean, private ignoreDesign: boolean) {
        const visData: any = {
            width: parseInt(this.svg.getAttribute('width')),
            height: parseInt(this.svg.getAttribute('height')),
            scale: 1,
            children: [],
            globalElementIndex: 0,
        };

        this.vdom = new VdomManager(visData, ignoreDesign);
        this.linkNodeToElement(visData, this.svg);
        this.svg.style.display = 'none';
        this.svg['selector'] = 'svg';

        this.addChildNodesToVisData(this.svg.childNodes, this.vdom.data);

        window.setTimeout(() => {
            // Re-do the styles.
            this.nodesToRestyle = [];
            // Can not use this.nodesToRestyle = this.nodesToElements.nodes because this links the object and adding
            // to this.nodesToRestyle would break the nodesToElements mapping.
            for(const node of this.nodesToElements.nodes) {
                this.nodesToRestyle.push(node);
            }
        }, 100);
    }

    enableFrontendDesignProperties() {
        this.ignoreDesign = false;
        this.vdom.enableFrontendDesignProperties();
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

        if(element === this.svg && attrName.indexOf('style;') === 0) {
            attrName = attrName.substr('style;'.length);
        }
        //attrName = this.checkAttrName(parentSelector, attrName, false);
        this.setAttrQueue.ensureInitialized(attrName, false);

        const evaluatedValue = typeof value === "function" ? value.call(<any> element, (<any> element).__data__, childIndex) : value;
        //const node = this.getNodeFromElement(element);
        //this.setAttrQueue.set(node, attrName, evaluatedValue, false);
        const node = this.getNodeFromElement(element);
        this.setAttrQueue.set(node, attrName, evaluatedValue, false);

        if(attrName === "href") {
            try {
                fetch(location.origin + evaluatedValue, {mode: 'cors'})
                    .then(resp => resp.blob())
                    .then(blob => createImageBitmap(blob))
                    .then(bitmap => {
                        //this.checkAttrName(parentSelector, "image", false);
                        this.setAttrQueue.ensureInitialized("image", false);
                        this.setAttrQueue[parentSelector]["image"][childIndex] = bitmap;
                    });
            }
            catch(e) {console.log(e);}
        }

        if(attrName === 'class' || attrName.indexOf('style') !== -1) {
            // Apply classes immediately so styles can be applied correctly.

            if(attrName === 'class') {
                node.className = evaluatedValue;
                this.nodesToRestyle.push(node);
            } else {
                const styleName = attrName.substr(6);
                if(!node.style) {
                    console.error('no styles on node ', node);
                }
                node.style[styleName] = evaluatedValue;
            }
        }
    }

    logged = 0;
    queueSetAttributeOnSelection(elements: (HTMLElement & {__data__: any})[], attrName: string, value) {
        if(!elements.length) return;
        if(!elements[0]) {
            //console.error('selection elements not found', elements);
            return;
        }
        const useSharedArray = 'SharedArrayBuffer' in self;

        let parentElement = elements[0].parentNode;
        let parentSelector = parentElement === this.svg ? "svg" : parentElement['selector'];
        if(!parentSelector) {
            safeLog(elements, parentElement);
            console.error('selector not found');
        }

        this.setAttrQueue.ensureInitialized(attrName, useSharedArray);

        for(let i = 0; i < elements.length; i++) {
            const svgEl = elements[i];

            const evaluatedValue = typeof value === "function" ? value(svgEl.__data__, i) : value;
            this.ensureElementIndex(svgEl);

            this.setAttrQueue.set(svgEl, attrName, evaluatedValue, useSharedArray);

            //TODO: re-implement.
            /*if(attrName === "href") {
                try {
                    fetch(location.origin + evaluatedValue, {mode: 'cors'})
                    .then(resp => resp.blob())
                    .then(blob => createImageBitmap(blob))
                    .then(bitmap => {
                        //this.checkAttrName(parentSelector, "image", useSharedArray, parentNode);
                        this.setAttrQueue.ensureInitialized("image", false);
                        this.setAttrQueue[parentSelector]["image"][indexOfParent] = bitmap;
                    });
                }
                catch(e) {console.log(e);}
            }*/
        }

        if(attrName === 'className' || attrName.indexOf('style') !== -1) {
            // Apply classes immediately so styles can be applied correctly.
            for(let i = 0; i < elements.length; i++) {
                const node = this.getNodeFromElement(elements[i]);
                const evaluatedValue = typeof value === "function" ? value(elements[i].__data__, i) : value;

                if(attrName === 'className') {
                    node.className = evaluatedValue;
                    this.nodesToRestyle.push(node);
                } else {
                    const styleName = attrName.substr(6);
                    node.style[styleName] = evaluatedValue;
                }
            }
        }
    }

    ensureElementIndex(svgEl: HTMLElement) {
        if(!svgEl['globalElementIndex']) {
            const node = this.getNodeFromElement(svgEl);
            svgEl['globalElementIndex'] = node.globalElementIndex;
        }
    }

    useAttrQueue(cb: (data) => void = () => {}) {
        if(this.nodesToRestyle) {
            this.applyStyles();
        }

        const data = this.setAttrQueue.getData();
        cb(data);
        this.vdom.updatePropertiesFromQueue(data);

        //this.setAttrQueue = {};
        this.setAttrQueue.clearData();
    }

    getAttributeFromSelector(element: Element, name: string) {
        const node = this.getNodeFromElement(element);
        
        if(!node) {
            console.error('trying to get attribute for unfit selection', node, element, name);
            throw Error('element not found');
        }
        
        return node[name];
    }
    
    getVisNode(element: Element): VdomNode|null {
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
            opacity: getRoundedAttr(el, 'opacity'),
            width: getRoundedAttr(el, 'width'),
            height: getRoundedAttr(el, 'height'),
            stroke: el.getAttribute('stroke'),
            "stroke-width": getRoundedAttr(el, 'stroke-width'),
            text: !el.childNodes || (el.childNodes.length === 1 && !(el.childNodes[0] as HTMLElement).tagName) ? el.textContent : undefined,
            'font-size': el.getAttribute('font-size'),
            'font': el.getAttribute('font'),
            'text-anchor': el.getAttribute('text-anchor'),
            href: el.getAttribute('href'),
            style: {},
            styleSpecificity: {},
            children: [],
            globalElementIndex: -1,
        };

        for(const styleProp in el.style) {
            if(el.style.hasOwnProperty(styleProp)) {
                const val = el.style[styleProp];
                if(val !== '' && typeof el.style[styleProp] !== 'function') {
                    const kebabCase = styleProp.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
                    node.style[kebabCase] = el.style[styleProp];
                }
            }
        }

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
                this.applyRuleToMatchingNodes(selector, rule);
            }
        }

        this.nodesToRestyle = [];
    }

    updateNodeSelector(oldSelector: string, newSelector: string) {
        /*if(oldSelector === newSelector) {
            return;
        }
        if(this.setAttrQueue[newSelector]) {
            console.warn('having problems rearranging the elements! old:', oldSelector, ', new:', newSelector,
                this.setAttrQueue[oldSelector], this.setAttrQueue[newSelector]);
            delete this.setAttrQueue[oldSelector];
        } else {
            this.setAttrQueue[newSelector] = this.setAttrQueue[oldSelector];
            delete this.setAttrQueue[oldSelector];
        }*/
    }

    private applyRuleToMatchingNodes(selectorString: string, rule: {style: {[settingName: string]: string}}): boolean {
        selectorString = selectorString.trim();

        const selector = selectorString
            .replace(' >', '>')
            .replace('> ', '>')
            .replace('svg>', '');
        
        const selectorPartsLooseStrict = selector.split(' ')
            .map(part => part.split('>'));


        const parentsOfInterest = [];
        for(const nodeToBeStyled of this.nodesToRestyle) {
            let parent = this.getNodeParent(nodeToBeStyled);
            while(parent && parentsOfInterest.indexOf(parent) === -1) {
                parentsOfInterest.push(parent);
                parent = this.getNodeParent(parent);
            }
        }
        const specificity = DrawingUtils.getCssRuleSpecificityNumber(selectorString);

        const setStyle = (styleName: string, rule: {style: {[settingName: string]: string}}, child: VdomNode) => {
            if(rule.style[styleName]) {
                const longName = 'style;' + styleName;
                const longSpecName = 'styleSpecificity;' + styleName;
                this.setAttrQueue.ensureInitialized(longName, false);
                this.setAttrQueue.ensureInitialized(longSpecName, false);
                /*this.checkAttrName(parentSelector, longName);
                this.checkAttrName(parentSelector, longSpecName);*/
                let setValue = false;

                if(!this.setAttrQueue.get(child, longName) && !child.style[styleName]) {
                    setValue = true;
                } else {
                    if(child.styleSpecificity[styleName]) {
                        // If a later rule has the same or higher specificity, apply.
                        // Hence, later rules override earlier rules.
                        if(child.styleSpecificity[styleName] <= specificity) {
                            if(this.setAttrQueue.get(child, longSpecName)) {
                                setValue = this.setAttrQueue.get(child, longSpecName) <= specificity;
                            } else {
                                setValue = true;
                            }
                        } else {
                            setValue = this.setAttrQueue.get(child, longSpecName) <= specificity;
                        }
                    } else {
                        setValue = this.setAttrQueue.get(child, longSpecName) <= specificity;
                    }
                }

                if(setValue) {
                    this.setAttrQueue.set(child, longName, rule.style[styleName], false);
                    this.setAttrQueue.set(child, longSpecName, specificity, false);
                    /*this.setAttrQueue[parentSelector][longName][childIndex] = rule.style[styleName];
                    this.setAttrQueue[parentSelector][longSpecName][childIndex] = specificity;*/
                }
            }
        };

        const checkNode = (currentNode: VdomNode, looseIndex = 0, strictIndex = 0): boolean => {
            const selPart = selectorPartsLooseStrict[looseIndex][strictIndex];

            for(let childIndex = 0; childIndex < currentNode.children.length; childIndex++) {
                const child = currentNode.children[childIndex];
                if(parentsOfInterest.indexOf(child) === -1 && this.nodesToRestyle.indexOf(child) === -1) {
                    continue;
                }
                let partialMatch = VdomManager.isCssRulePartialMatch(selPart, child, currentNode);

                if(partialMatch) {
                    if(selectorPartsLooseStrict[looseIndex].length > strictIndex + 1) {
                        checkNode(child, looseIndex, strictIndex + 1);
                    } else if(selectorPartsLooseStrict.length > looseIndex + 1) {
                        checkNode(child, looseIndex + 1, strictIndex);
                    } else {
                        const parentSelector = this.getNodeSelector(currentNode);

                        setStyle('stroke', rule, child);
                        setStyle('stroke-opacity', rule, child);
                        setStyle('stroke-width', rule, child);
                        setStyle('stroke-linejoin', rule, child);
                        setStyle('fill', rule, child);
                        setStyle('fill-opacity', rule, child);
                        setStyle('font', rule, child);
                        setStyle('opacity', rule, child);
                    }
                } else {
                    if(child['removedClasses']) {
                        // temporarily add the class, see if it matches this rule, and if so, un-apply its stuff.
                        for(const removedClass of child['removedClasses']) {
                            child.className += ' ' + removedClass;

                            let newPartialMatch = VdomManager.isCssRulePartialMatch(selPart, child, currentNode);
                            if(newPartialMatch) {
                                const parentSelector = this.getNodeSelector(currentNode);
                                this.removeRuleStylesFromNode(parentSelector, child, childIndex, rule);
                            }

                            child.className = child.className.substr(0, child.className.length -
                                removedClass.length - 1);
                        }
                        setTimeout(() => {
                            delete child['removedClasses'];
                        }); // After this frame, reset which classes have been removed.
                    }
                    checkNode(child, looseIndex, strictIndex);
                }
            }
            return false;
        };

        return checkNode(this.vdom.data);
    }

    removeRuleStylesFromNode(parentSelector: string, child: VdomNode, childIndex: number,
                             rule: {style: {[settingName: string]: string}}) {
        if(rule.style['stroke']) {
            const color = drawingUtils.colorToRgba(rule.style['stroke']);
            if(child.style['stroke'] === color || child.style['stroke-rgba'] === color) {
                //this.checkAttrName(parentSelector, 'style;stroke');
                //this.setAttrQueue[parentSelector]['style;stroke'][childIndex] = '';
                //this.checkAttrName(parentSelector, 'style;stroke-rgba');
                //this.setAttrQueue[parentSelector]['style;stroke-rgba'][childIndex] = '';

                this.setAttrQueue.ensureInitialized('style;stroke', false);
                this.setAttrQueue.ensureInitialized('style;stroke-rgba', false);
                this.setAttrQueue.set(child, 'style;stroke', '', false);
                this.setAttrQueue.set(child, 'style;troke-rgba', '', false);
            }
        }
        //TODO remove other styles.
    }

    removeNodeFromParent(element: Element, node: VdomNode) {
        const parentSelector = element['parentSelector'];
        const childIndex = element['childIndex'];
        this.vdom.removeNode(childIndex, parentSelector);
        let index = this.nodesToElements.nodes.indexOf(node);
        if(index === -1) {
            return console.error('node not found', node);
        }

        this.nodesToElements.nodes.splice(index, 1);
        this.nodesToElements.elements.splice(index, 1);

        // Remove all pending changes on this element
        const selector = element['selector'];
        delete this.setAttrQueue[selector];

        // Update indices
        for(let i = index; i < this.nodesToElements.nodes.length; i++) {
            this.nodesToElements.nodes[i].globalElementIndex = i;
        }

        for(let attrName in this.setAttrQueue[parentSelector]) {
            for(let i = childIndex + 1; i < this.setAttrQueue[parentSelector][attrName].length; i++) {
                this.setAttrQueue[parentSelector][attrName][i-1] = this.setAttrQueue[parentSelector][attrName][i];
            }
        }
    }

    addNodeToParent(parentNode, node) {
        parentNode.children.push(node);
        this.nodesToRestyle.push(node);
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
                this.nodesToRestyle.push(node);
                
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
    }

    getNodeSelector(node: VdomNode): string {
        if(node === this.vdom.data) {
            return 'svg';
        }
        const element = this.getElementFromNode(node);
        if(!element) {
            console.error('could not find element for node ', node);
            return '';
        }
        return this.getElementSelector(element, undefined, node);
    }
    
    getElementSelector(element: Element, parentNode?: VdomNode, node?: VdomNode): string|null {
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

                if(!parentNode) {
                    parentNode = this.vdom.getVisNodeFromSelector(parentSelector);
                }
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
                sel = this.combineElementSelectors(parentSelector, name, index);
            }
            
            return sel;
        }
    }

    combineElementSelectors(parentSelector: string, elementType: string, childIndex: number) {
        return parentSelector + ' > ' + elementType + ':nth-child(' + childIndex + ')';
    }

    getNodeParent(node:VdomNode): VdomNode|null {
        if(node === this.vdom.data) {
            return null;
        }
        const el = this.getElementFromNode(node);
        if(!el) {
            return null;
        }
        const parentEl = el.parentNode as Element;
        return this.getNodeFromElement(parentEl);
    }

    linkNodeToElement(node: VdomNode, element: Node) {
        this.nodesToElements.nodes.push(node);
        node.globalElementIndex = this.nodesToElements.elements.length;
        this.nodesToElements.elements.push(element as Element);
    }

    getElementFromNode(node: VdomNode): Element {
        if(node === this.vdom.data) {
            return this.svg;
        }
        return this.nodesToElements.elements[node.globalElementIndex];
    }

    getNodeFromElement(element: Element): VdomNode {
        if(element === this.svg) {
            return this.vdom.data;
        }
        const elementIndex = this.nodesToElements.elements.indexOf(element);
        return this.nodesToElements.nodes[elementIndex];
    }

    getParentNode(node: VdomNode): VdomNode|null {
        const element = this.getElementFromNode(node);
        const parentElement = element.parentNode as Element;
        return this.getNodeFromElement(parentElement);
    }

    getTotalTransformation(node: VdomNode): Transformation {
        let parent = this.getParentNode(node);
        const parents = [node];

        while(parent) {
            parents.push(parent);
            parent = this.getParentNode(parent);
        }

        parent = parents.pop();
        let totalTransform: Transformation = {
            translateX: 0,
            translateY: 0,
            scaleX: 0,
            scaleY: 0,
            rotate: 0,
            translateBeforeScale: false
        };

        while(parent) {
            const transform = DrawingUtils.parseTransform(parent.transform);
            totalTransform = DrawingUtils.addTransforms(totalTransform, transform);
            parent = parents.pop();
        }

        return totalTransform;
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
