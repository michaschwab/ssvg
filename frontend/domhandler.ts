import {VDOM, VdomNode, VdomNodeType} from "../util/vdom/vdom";
import {VdomManager} from "../util/vdom/vdom-manager";
import DrawingUtils, {Transformation} from "../canvasworker/drawingUtils";
import drawingUtils from "../canvasworker/drawingUtils";

export const CSS_STYLES = ['stroke', 'stroke-opacity', 'stroke-width', 'stroke-linejoin',
    'fill', 'fill-opacity', 'font', 'opacity', 'font-family', 'font-size'];

export default class Domhandler {
    private readonly vdom: VdomManager;
    nodes: {[globalElementIndex: number]: VdomNode} = {};
    elements: {[globalElementIndex: number]: SsvgElement} = {};
    private nodesToRestyle: VdomNode[] = [];
    private globalElementIndexCounter = 0;

    constructor(private svg: SVGElement & SsvgElement, useWorker: boolean, private ignoreDesign: boolean) {
        const visData: VDOM = {
            type: 'svg',
            width: parseInt(this.svg.getAttribute('width')),
            height: parseInt(this.svg.getAttribute('height')),
            scale: 1,
            children: [],
            globalElementIndex: 0,
            style: {},
            css: {},
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
            const currentNodes = Object.values(this.nodes);
            for(const node of currentNodes) {
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
        //let childIndex = element.childIndex;
        this.vdom.ensureInitialized(attrName, false);

        const node = this.getNodeFromElement(element);

        const evaluatedValue = typeof value === "function" ?
            value.call(element, element.__data__, element.__data__.index) : value;

        if(!node) {
            console.error('node not found for ', element);
            return;
        }
        this.vdom.set(node, attrName, evaluatedValue, false);

        if(attrName === "href") {
            try {
                fetch(location.origin + evaluatedValue, {mode: 'cors'})
                    .then(resp => resp.blob())
                    .then(blob => createImageBitmap(blob))
                    .then(bitmap => {
                        this.vdom.ensureInitialized('image', false);
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

    queueSetAttributeOnSelection(elements: SsvgElement[], attrName: string, value) {
        if(!elements.length) return;
        if(!elements[0]) {
            //console.error('selection elements not found', elements);
            return;
        }

        this.vdom.ensureInitialized(attrName, true, this.globalElementIndexCounter);

        for(let i = 0; i < elements.length; i++) {
            const svgEl = elements[i];

            const evaluatedValue = typeof value === "function" ? value(svgEl.__data__, svgEl.__data__.index) : value;

            this.vdom.set(svgEl, attrName, evaluatedValue);

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

    useAttrQueue(cb: (data) => void = () => {}, onNodeUpdated?: (node: VdomNode, attrName: string) => void) {
        if(this.nodesToRestyle && this.nodesToRestyle.length) {
            this.applyStyles();
        }

        const data = this.vdom.getQueue();
        this.vdom.updatePropertiesFromQueue(data, onNodeUpdated);
        cb(data);
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
            css: {},
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
            if(nodeToBeStyled) { // I don't know why, but there are null values in there.
                let parent = this.getNodeParent(nodeToBeStyled);
                while(parent && parentsOfInterest.indexOf(parent) === -1) {
                    parentsOfInterest.push(parent);
                    parent = this.getNodeParent(parent);
                }
            }
        }

        const setStyle = (styleName: string, rule: {style: {[settingName: string]: string}}, child: VdomNode) => {
            if(rule.style[styleName]) {
                const longSpecName = `css;${selectorString};${styleName}`;
                this.vdom.ensureInitialized(longSpecName);

                this.vdom.set(child, longSpecName, rule.style[styleName]);
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
                        if(!child.css[selectorString]) {
                            for(const styleName of CSS_STYLES) {
                                setStyle(styleName, rule, child);
                            }
                        }
                    }
                } else {
                    if(child['removedClasses']) {
                        // temporarily add the class, see if it matches this rule, and if so, un-apply its stuff.
                        for(const removedClass of child['removedClasses']) {
                            child.className += ' ' + removedClass;

                            let newPartialMatch = VdomManager.isCssRulePartialMatch(selPart, child, currentNode);
                            if(newPartialMatch) {
                                this.removeRuleStylesFromNode(selectorString, child);
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

    removeRuleStylesFromNode(selector: string, child: VdomNode) {
        if(child.css[selector]) {
            this.vdom.ensureInitialized(`css;${selector};*`);
            this.vdom.set(child, `css;${selector};*`, '');
        }
    }

    removeNodeFromParent(element: SsvgElement, node: VdomNode, parentNode: VdomNode) {
        //console.log('removing', node, 'from', parentNode, [...parentNode.children], childIndex, childIndex2);
        this.vdom.removeNode(node, parentNode);

        this.nodes[node.globalElementIndex] = null;
        this.elements[element.globalElementIndex] = null;

        const restyleIndex = this.nodesToRestyle.indexOf(node);
        if(restyleIndex !== -1) {
            this.nodesToRestyle.splice(restyleIndex, 1);
        }
        /*let index = this.nodes.indexOf(node);
        if(index === -1) {
            return console.error('node not found', node);
        }

        this.nodesToElements.nodes.splice(index, 1);
        this.nodesToElements.elements.splice(index, 1);*/
        safeLog('deleting from parent', element, node, parentNode);
    }

    restyleNode(node: VdomNode) {
        if(!this.nodes[node.globalElementIndex] || this.nodes[node.globalElementIndex] !== node) {
            console.error(node);
            throw new Error('restyling incorrect node');
        }
        this.nodesToRestyle.push(node);
    }
    
    private addChildNodesToVisData(childEls: SsvgElement[]|NodeList, parentNode: VdomNode): void {
        const parentEl = this.getElementFromNode(parentNode);

        for(let i  = 0; i < childEls.length; i++) {
            let el = childEls[i] as SsvgElement;

            try
            {
                const node = this.getNodeDataFromEl(el);

                /*el.parentSelector = this.getElementSelector(parentEl);
                el.selector = this.getElementSelector(el);*/
                //el.childIndex = parentNode.children.length;

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

    combineElementSelectors(parentSelector: string, elementType: string, childIndex: number) {
        return parentSelector + ' > ' + elementType + ':nth-child(' + childIndex + ')';
    }

    getNodeParent(node: VdomNode): VdomNode|null {
        if(node === this.vdom.data) {
            return null;
        }
        const el = this.getElementFromNode(node);
        if(!el) {
            console.error('can not find element for node ', node);
            return null;
        }
        const parentEl = el.parentNode as SsvgElement;
        return this.getNodeFromElement(parentEl);
    }

    linkNodeToElement(node: VdomNode, element: SsvgElement) {
        node.globalElementIndex = this.globalElementIndexCounter;
        element.globalElementIndex = this.globalElementIndexCounter;
        this.globalElementIndexCounter++;

        this.nodes[node.globalElementIndex] = node;
        this.elements[node.globalElementIndex] = element;

        this.vdom.addNode(node);
    }

    getElementFromNode(node: VdomNode): SsvgElement {
        if(node === this.vdom.data) {
            return this.svg;
        }
        return this.elements[node.globalElementIndex];
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
            translateBeforeScale: false,
            rotateLast: false,
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
};
