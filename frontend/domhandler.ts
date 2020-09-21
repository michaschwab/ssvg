import {VdomNode, VdomNodeType} from "../util/vdom/vdom";
import {VdomManager} from "../util/vdom/vdom-manager";
import DrawingUtils, {Transformation} from "../canvasworker/drawingUtils";
import drawingUtils from "../canvasworker/drawingUtils";

export const CSS_STYLES = ['stroke', 'stroke-opacity', 'stroke-width', 'stroke-linejoin',
    'fill', 'fill-opacity', 'font', 'opacity', 'font-family', 'font-size'];

export default class Domhandler {
    private readonly vdom: VdomManager;
    public nodesToElements: { nodes: VdomNode[], elements: SsvgElement[]} = { nodes: [], elements: []};
    private nodesToRestyle: VdomNode[] = [];
    private globalElementIndexCounter = 0;

    constructor(private svg: SVGElement & SsvgElement, useWorker: boolean, private ignoreDesign: boolean) {
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
    
    queueSetAttributeOnElement(element: SsvgElement, attrName: string,
                               value: (number|string|((el: HTMLElement) => (number|string)))) {
        //TODO: merge with updatePropertiesFromQueue from VdomManager?
        const parent = element.parentNode;
        let parentSelector = parent === this.svg ? "svg" : element.parentSelector;
        let childIndex = element.childIndex;
    
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
        this.vdom.ensureInitialized(attrName, false, this.globalElementIndexCounter);

        const evaluatedValue = typeof value === "function" ? value.call(element, element.__data__, childIndex) : value;
        //const node = this.getNodeFromElement(element);
        //this.setAttrQueue.set(node, attrName, evaluatedValue, false);
        const node = this.getNodeFromElement(element);
        this.vdom.set(node, attrName, evaluatedValue, false);
        if(attrName.indexOf('style;') === 0) {
            const longSpecName = 'styleSpecificity;' + attrName.substr(6);
            this.vdom.ensureInitialized(longSpecName, false, this.globalElementIndexCounter);
            this.vdom.set(node, longSpecName, 3000, false);
        }


        if(attrName === "href") {
            try {
                fetch(location.origin + evaluatedValue, {mode: 'cors'})
                    .then(resp => resp.blob())
                    .then(blob => createImageBitmap(blob))
                    .then(bitmap => {
                        //this.checkAttrName(parentSelector, "image", false);
                        this.vdom.ensureInitialized("image", false, this.globalElementIndexCounter);
                        this.vdom.set(node, 'image', bitmap, false);
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
    queueSetAttributeOnSelection(elements: SsvgElement[], attrName: string, value) {
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

        this.vdom.ensureInitialized(attrName, useSharedArray, this.globalElementIndexCounter);
        let longSpecName;
        if(attrName.indexOf('style;') === 0) {
            longSpecName = 'styleSpecificity;' + attrName.substr(6);
            this.vdom.ensureInitialized(longSpecName, useSharedArray, this.globalElementIndexCounter);
        }

        for(let i = 0; i < elements.length; i++) {
            const svgEl = elements[i];

            const evaluatedValue = typeof value === "function" ? value(svgEl.__data__, i) : value;
            this.ensureElementIndex(svgEl);

            this.vdom.set(svgEl, attrName, evaluatedValue, useSharedArray);

            if(longSpecName) {
                this.vdom.set(svgEl, longSpecName, 3000, false);
            }

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

    ensureElementIndex(svgEl: SsvgElement) {
        if(!svgEl.globalElementIndex) {
            const node = this.getNodeFromElement(svgEl);
            svgEl.globalElementIndex = node.globalElementIndex;
        }
    }

    useAttrQueue(cb: (data) => void = () => {}) {
        if(this.nodesToRestyle) {
            this.applyStyles();
        }

        const data = this.vdom.getQueue();
        cb(data);
        this.vdom.updatePropertiesFromQueue(data);
        this.vdom.clearQueue();
    }

    getAttributeFromSelector(element: SsvgElement, name: string) {
        const node = this.getNodeFromElement(element);
        
        if(!node) {
            console.error('trying to get attribute for unfit selection', node, element, name);
            throw Error('element not found');
        }
        
        return node[name];
    }
    
    getVisNode(element: SsvgElement): VdomNode|null {
        if(element === this.svg) {
            return this.vdom.data;
        }
        return this.vdom.getNodeFromIndex(element.globalElementIndex);
        /*const selector = this.getElementSelector(element);

        if(selector === null) {
            return null;
        }
        
        return this.vdom.getVisNodeFromSelector(selector);*/
    }
    
    getNodeDataFromEl(el: HTMLElement): VdomNode {
        const roundedAttrs = ['cx', 'cy', 'r', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'stroke-width'];

        const node = {
            type: el.tagName.toLowerCase() as VdomNodeType,
            className: el.getAttribute('class'),
            style: {},
            styleSpecificity: {},
            children: [],
            globalElementIndex: -1,
            text: !el.childNodes || (el.childNodes.length === 1 && !(el.childNodes[0] as HTMLElement).tagName)
                ? el.textContent : undefined,
        };

        for(let i = 0; i < el.attributes.length; i++) {
            let value: string|number = el.attributes[i].nodeValue;
            if(roundedAttrs.indexOf(el.attributes[i].nodeName) !== -1) {
                value = parseFloat(value);
            }
            node[el.attributes[i].nodeName] = value;
        }
        node.style = {};

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
                this.vdom.ensureInitialized(longName, false, this.globalElementIndexCounter);
                this.vdom.ensureInitialized(longSpecName, false, this.globalElementIndexCounter);
                /*this.checkAttrName(parentSelector, longName);
                this.checkAttrName(parentSelector, longSpecName);*/
                let setValue = false;

                if(!this.vdom.getQueueValue(child, longName) && !child.style[styleName]) {
                    setValue = true;
                } else {
                    if(child.styleSpecificity[styleName]) {
                        // If a later rule has the same or higher specificity, apply.
                        // Hence, later rules override earlier rules.
                        if(child.styleSpecificity[styleName] <= specificity) {
                            if(this.vdom.getQueueValue(child, longSpecName)) {
                                setValue = this.vdom.getQueueValue(child, longSpecName) <= specificity;
                            } else {
                                setValue = true;
                            }
                        } else {
                            setValue = this.vdom.getQueueValue(child, longSpecName) <= specificity;
                        }
                    } else {
                        setValue = this.vdom.getQueueValue(child, longSpecName) <= specificity;
                    }
                }

                if(setValue) {
                    this.vdom.set(child, longName, rule.style[styleName], false);
                    this.vdom.set(child, longSpecName, specificity, false);
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
                        for(const styleName of CSS_STYLES) {
                            setStyle(styleName, rule, child);
                        }
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

                this.vdom.ensureInitialized('style;stroke', false, this.globalElementIndexCounter);
                this.vdom.ensureInitialized('style;stroke-rgba', false, this.globalElementIndexCounter);
                this.vdom.set(child, 'style;stroke', '', false);
                this.vdom.set(child, 'style;stroke-rgba', '', false);
            }
        }
        //TODO remove other styles.
    }

    removeNodeFromParent(element: Element, node: VdomNode, parentNode: VdomNode) {
        const childIndex = element['childIndex'];
        //console.log('removing', node, 'from', parentNode, [...parentNode.children], childIndex, childIndex2);
        this.vdom.removeNode(childIndex, parentNode.globalElementIndex);
        let index = this.nodesToElements.nodes.indexOf(node);
        if(index === -1) {
            return console.error('node not found', node);
        }

        this.nodesToElements.nodes.splice(index, 1);
        this.nodesToElements.elements.splice(index, 1);

        // Remove all pending changes on this element
        //this.setAttrQueue.removePendingChanges(node);
    }

    restyleNode(parentNode, node) {
        this.nodesToRestyle.push(node);
    }
    
    private addChildNodesToVisData(childEls: HTMLElement[]|NodeList, parentNode: VdomNode): void {
        const parentEl = this.getElementFromNode(parentNode);

        for(let i  = 0; i < childEls.length; i++) {
            let el = childEls[i] as SsvgElement;
            
            try
            {
                const node = this.getNodeDataFromEl(el);

                el.parentSelector = this.getElementSelector(parentEl);
                el.selector = this.getElementSelector(el);
                el.childIndex = parentNode.children.length;

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
    
    getElementSelector(element: SsvgElement, parentNode?: VdomNode, node?: VdomNode): string|null {
        let sel = element['selector'];
        
        if(sel)
        {
            return sel;
        }
        else
        {
            if(element === this.svg) {
                sel = 'svg';
            } else {
                let parentSelector = element.parentSelector ? element.parentSelector : '';

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
        const parentEl = el.parentNode as SsvgElement;
        return this.getNodeFromElement(parentEl);
    }

    linkNodeToElement(node: VdomNode, element: SsvgElement) {
        this.nodesToElements.nodes.push(node);
        this.nodesToElements.elements.push(element);

        node.globalElementIndex = this.globalElementIndexCounter;
        element.globalElementIndex = this.globalElementIndexCounter;
        this.globalElementIndexCounter++;

        this.vdom.addNode(node);
    }

    getElementFromNode(node: VdomNode): SsvgElement {
        if(node === this.vdom.data) {
            return this.svg;
        }
        const nodeIndex = this.nodesToElements.nodes.indexOf(node);
        return this.nodesToElements.elements[nodeIndex];
    }

    getNodeFromElement(element: SsvgElement): VdomNode {
        if(element === this.svg) {
            return this.vdom.data;
        }
        return this.vdom.getNodeFromIndex(element.globalElementIndex);
    }

    getParentNode(node: VdomNode): VdomNode|null {
        const element = this.getElementFromNode(node);
        const parentElement = element.parentNode as SsvgElement;
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

export type SsvgElement = HTMLElement & {
    __data__: any,
    globalElementIndex: number,
    parentSelector: string,
    selector: string,
    childIndex: number
};
