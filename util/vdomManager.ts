import DrawingUtils from "../canvasworker/drawingUtils";

export class SetPropertyQueueData {
    [attrName: string]:
        string[] | SharedArrayBuffer
}

class CompleteSetPropertyQueueData {
    'raw': SetPropertyQueueData;
    'shared': {
        [attrName: string]: Int32Array
    };
}

export class SetPropertyQueue {
    private data: CompleteSetPropertyQueueData;
    private useSharedArrayFor = ['cx', 'cy', 'x1', 'x2', 'y1', 'y2', 'x', 'y'];
    private static BUFFER_PRECISION_FACTOR = 10;

    ensureInitialized(attrName: string, useBuffer: boolean) {
        if(!this.data) {
            this.data = {'raw': {}, 'shared': {}};
        }
        if(attrName === 'class') {
            attrName = 'className';
        }

        if(!useBuffer || this.useSharedArrayFor.indexOf(attrName) === -1) {
            if(!this.data.raw[attrName]) {
                this.data.raw[attrName] = [];
            }
        } else {
            if(!this.data.shared[attrName]) {
                const length = 10000; //Todo use number of elements in vdom
                const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * length);
                const values = new Int32Array(buffer);

                // If values have been previously set without a buffer, transfer them.
                if(this.data.raw[attrName] &&
                    !(this.data.raw[attrName] instanceof SharedArrayBuffer)) {
                    const prevData: string[] = <any> this.data.raw[attrName];

                    prevData.forEach((value, index) => {
                        values[index] = parseFloat(value) * SetPropertyQueue.BUFFER_PRECISION_FACTOR;
                    });
                }

                this.data.raw[attrName] = buffer;
                this.data.shared[attrName] = values;
            }
        }
    }

    set(element: Element|VdomNode, attrName: string, value: any, useBuffer: boolean) {
        if(attrName === 'class') {
            attrName = 'className';
        }
        const storage = useBuffer ? 'shared' : 'raw';
        this.data[storage][attrName][element['globalElementIndex']] = value;
    }

    get(node: VdomNode, attrName: string) {
        return this.data.raw[attrName][node['globalElementIndex']];
    }

    getData() {
        return this.data.raw;
    }

    clearData() {
        this.data = {'raw': {}, 'shared': {}};
    }
}

export type VDOM = {
    width: number;
    height: number;
    scale: number;
} & VdomNode;

export type VdomNodeType = 'svg'|'g'|'rect'|'circle'|'path'|'title'|'tspan'|'text';

export type VdomNode = {
    style: {[styleName: string]: string},
    styleSpecificity: {[styleName: string]: number},
    type: VdomNodeType,
    children: VdomNode[],
    globalElementIndex: number,
    transform?: string,
    fill?: string,
    d?: string,
    stroke?: string,
    strokeWidth?: string,
    cx?: number,
    cy?: number,
    r?: number,
    x?: number,
    y?: number,
    x1?: number,
    y1?: number,
    x2?: number,
    y2?: number,
    dx?: string,
    dy?: string,
    width?: number,
    height?: number,
    textAlign?: string,
    text?: string,
    className?: string,
    id?: string,
}

export class VdomManager {

    private static ATTRIBUTES_NOT_IGNORED_WITH_IGNOREDESIGN = ['fill', 'stroke', 'opacity', 'x1', 'x2', 'y1', 'y2', 'x',
        'y'];
    private indexToNodeMap: {[index: number]: VdomNode} = {};
    
    constructor(public data: VDOM, private ignoreDesign = false) {
        //console.log(data);
        const addToMap = (node: VdomNode) => {
            this.indexToNodeMap[node.globalElementIndex] = node;
            for(const child of node.children) {
                addToMap(child);
            }
        };
        addToMap(data);
    }

    enableFrontendDesignProperties() {
        this.ignoreDesign = false;
    }
    
    addNode(nodeData: VdomNode, parentNodeSelector: string) {
        let parentNode = this.getVisNodeFromSelector(parentNodeSelector);
        if(!parentNode) {
            if(parentNodeSelector === "") {
                parentNode = this.data;
            } else {
                console.error(parentNode, parentNodeSelector);
            }
        }
        this.applyParentStyles(parentNode, nodeData);
        
        if(!parentNode || !parentNode.children) {
            console.error('parent node not found or no children: ', parentNode, parentNodeSelector, this.data);
        }
        
        parentNode.children.push(nodeData);
        this.indexToNodeMap[nodeData.globalElementIndex] = nodeData;
        return nodeData;
    }

    removeNode(childIndex: number, parentNodeSelector: string) {
        let parentNode = this.getVisNodeFromSelector(parentNodeSelector);
        if(!parentNode) {
            if(parentNodeSelector === "") {
                parentNode = this.data;
            } else {
                console.error(parentNode, parentNodeSelector);
            }
        }

        parentNode.children.splice(childIndex, 1);
        this.cachedListSelections = {}; //TODO only remove relevant cache.
    }

    applyParentStyles(parentNode: VdomNode, childNode: VdomNode) {
        for(const style in parentNode.style) {
            if(!childNode.style[style]) {
                childNode.style[style] = parentNode.style[style];
            }
        }
    }
    
    getParentNodeFromSelector(parentSelector: string) {
        if(!parentSelector) {
            console.error('no parent selector', parentSelector);
        }
        //if(setAttrQueue.hasOwnProperty(parentSelector)) {
        let parentNode;
        if(parentSelector === 'SVG_PARENT') {
            parentNode = {children: [this.data]};
        } else {
            parentNode = this.getVisNodeFromSelector(parentSelector);
        }
        if(!parentNode) {
            console.error('parent node not found with selector', parentSelector);
        }
        return parentNode;
    }

    applyStyleToNodeAndChildren(node: VdomNode, styleName: string, styleValue: string, specificity: number) {
        if(!node['styleSpecificity'][styleName] || node['styleSpecificity'][styleName] <= specificity) {
            node['style'][styleName] = styleValue;
            node['styleSpecificity'][styleName] = specificity;
        }

        if(node.children) {
            for(let child of node.children) {
                this.applyStyleToNodeAndChildren(child, styleName, styleValue, specificity);
            }
        }
    }

    private getNodeFromIndex(index: number): VdomNode {
        return this.indexToNodeMap[index];
    }

    private static ROUNDED_ATTRS = ['cx', 'cy'];

    updatePropertiesFromQueue(setAttrQueue: SetPropertyQueueData) {
                
        for(let attrName in setAttrQueue) {
            const attrNameStart = attrName.substr(0, 'style;'.length);

            if(this.ignoreDesign && (attrNameStart === 'style;' ||
                VdomManager.ATTRIBUTES_NOT_IGNORED_WITH_IGNOREDESIGN.indexOf(attrName) !== -1)) {
                continue;
            }

            let values: string[]|Int32Array;
            let factor: number;

            if('SharedArrayBuffer' in self &&
                setAttrQueue[attrName] instanceof SharedArrayBuffer) {
                values = new Int32Array(<ArrayBuffer> setAttrQueue[attrName]);
                factor = 0.1;
            } else {
                values = setAttrQueue[attrName] as string[];
            }

            for(let childIndex in values) {
                const index = parseInt(childIndex);
                const childNode = this.getNodeFromIndex(index);
                if(!childNode) {
                    continue;
                }
                let value = factor ? factor * <number> values[childIndex] : values[childIndex];
                if(attrNameStart === 'style;') {
                    const styleName = attrName.substr('style;'.length);
                    const specificityAttrName = 'styleSpecificity;' + styleName;
                    try {
                        const matchingSpecificity: number = setAttrQueue[specificityAttrName][childIndex];
                        this.applyStyleToNodeAndChildren(childNode, styleName, <string> value, matchingSpecificity);
                        this.updateDeducedStyles(childNode, styleName, <string> value);
                    } catch (e) {
                        console.error(setAttrQueue, specificityAttrName, childIndex)
                        this.applyStyleToNodeAndChildren(childNode, styleName, <string> value, -1);
                    }

                } else {
                    if(VdomManager.ROUNDED_ATTRS.indexOf(attrName) !== -1) {
                        value = Math.round(<number> value);
                    }
                    childNode[attrName] = value;
                    this.updateDeducedStyles(childNode, attrName, <string> value);
                }
            }
        }
    }

    updateDeducedStyles(node: VdomNode, attrName: string, value: string) {
        if(['opacity', 'fill-opacity', 'stroke-opacity', 'stroke', 'fill'].indexOf(attrName) !== -1) {
            let stroke = node.style.stroke ? node.style.stroke : node.stroke;
            if(stroke) {
                let strokeOpacity = node.style['stroke-opacity'] === undefined ? node.style['opacity']
                    : node.style['stroke-opacity'];
                if(strokeOpacity === undefined) {
                    strokeOpacity = node['stroke-opacity'] === undefined ? node['opacity'] : node['stroke-opacity'];
                }

                node.style['stroke-rgba'] = DrawingUtils.colorToRgba(stroke, strokeOpacity);
            }
        }
    }
    
    private cachedListSelections: {[selector: string]: {[index: number]: VdomNode}} = {};
    public getVisNodeFromSelector(selector: string): VdomNode|null {
        const lastSplitPos = selector.lastIndexOf('>');
        const selectorWithoutLast = selector.substr(0, lastSplitPos);
        const lastPart = selector.substr(lastSplitPos + 1);
        const parentSel = selectorWithoutLast ? this.cachedListSelections[selectorWithoutLast] : null;
        let index = -1;
        const nthChildPosition = lastPart.indexOf(':nth-child(');
        if(nthChildPosition !== -1) {
            index = parseInt(lastPart.substr(nthChildPosition + 11)); // length of ':nth-child('
            if(parentSel && parentSel[index]) {
                return parentSel[index];
            }
        }
        
        const selectedNodes: VdomNode[] = [];
        this.findMatchingChildren(this.data, selector, 0, selectedNodes);
        
        if(selectedNodes && selectedNodes.length === 1) {
            const el = selectedNodes[0];
            if(index !== -1) {
                if(!this.cachedListSelections[selectorWithoutLast]) {
                    this.cachedListSelections[selectorWithoutLast] = {};
                }
                this.cachedListSelections[selectorWithoutLast][index] = el;
            }
            return el;
        }
        return null;
    }
    
    public getVisNodesFromSelector(visNode: VdomNode, selector: string) {
        const selectedNodes = [];
        this.findMatchingChildren(visNode, selector, 0, selectedNodes);
        return selectedNodes;
    }

    private findChildrenOfType(visNode: VdomNode, type: string, selectedNodes: VdomNode[]) {
        const addDirectChildrenIfMatch = (node: VdomNode) => {
            for(const child of node.children) {
                if(child.type === type) {
                    selectedNodes.push(child);
                }
                if(node.children.length !== 0) {
                    addDirectChildrenIfMatch(child);
                }
            }
        };
        addDirectChildrenIfMatch(visNode);
    }

    public filterNodesBySelector(parentNode: VdomNode, nodes: VdomNode[], selector: string) {
        return nodes.filter(node => VdomManager.isCssRulePartialMatch(selector, node, parentNode));
    }
    
    private findMatchingChildren(visNode: VdomNode, selector: string, matchIndex: number, selectedNodes: VdomNode[],
                                 selectedNodeSelectors: string[] = []) {
        if(!selector && selector !== '') {
            console.error(visNode, selector, matchIndex, selectedNodes, selectedNodeSelectors);
            throw Error('undefined selector');
        }

        let selParts = selector.split('>').map(s => s.trim());
        let selPart = selParts[matchIndex];
        
        if(matchIndex === 0 && selPart === 'svg') {
            matchIndex++;
            selPart = selParts[matchIndex];
            if(matchIndex === selParts.length) {
                selectedNodes.push(visNode);
                selectedNodeSelectors.push(selector);
                return;
            }
        }

        if(selector.match(/^[a-z]+$/)) {
            return this.findChildrenOfType(visNode, selector, selectedNodes);
        }
        
        for(let i = 0; i < visNode.children.length; i++) {
            let node = visNode.children[i];
            let matching = false;
            
            if(VdomManager.isCssRulePartialMatch(selPart, node, visNode)) {
                if(matchIndex === selParts.length - 1) {
                    selectedNodes.push(node);
                    selectedNodeSelectors.push(selector);
                } else {
                    matching = true;
                }
            }
            
            if(node.children && (matching || selParts.length < 2) && matchIndex + 1 < selParts.length) {
                this.findMatchingChildren(node, selector, matchIndex + 1, selectedNodes, selectedNodeSelectors);
            }
        }
    }

    public static isCssRulePartialMatch(cssRuleSelectorPart: string, node: VdomNode, parentNode: VdomNode): boolean {
        if(cssRuleSelectorPart.substr(0, 5) === ':not(') {
            const newSelPart = cssRuleSelectorPart.substr(0, cssRuleSelectorPart.length - 1).substr(5);
            return !VdomManager.isCssRulePartialMatch(newSelPart, node, parentNode);
        }
        if(cssRuleSelectorPart[0] === '.') { // Example: .className or .classnameA.classnameB
            const searchClassNames = cssRuleSelectorPart.split('.');
            searchClassNames.shift(); // remove empty first string.
            if(node.className) {
                let allTrue = true;
                for(const searchClassName of searchClassNames) {
                    if(node.className.split(' ').indexOf(searchClassName) === -1) {
                        allTrue = false;
                    }
                }
                return allTrue;
            }
        } else if(cssRuleSelectorPart[0] === '#') { // Example: #id
            if(cssRuleSelectorPart.substr(1) === node.id) {
                return true;
            }
        } else if(cssRuleSelectorPart.match(/^[a-z]+$/)) { // Example: rect
            if(cssRuleSelectorPart === node.type) {
                return true;
            }
        } else if(cssRuleSelectorPart.indexOf(':nth-child(') !== -1) {
            let type = 'any';
            let indexPart = cssRuleSelectorPart;

            if(cssRuleSelectorPart[0] !== ':') {
                type = cssRuleSelectorPart.substr(0, cssRuleSelectorPart.indexOf(':'));
                indexPart = cssRuleSelectorPart.substr(cssRuleSelectorPart.indexOf(':'));
            }

            const targetIndex = parseInt(indexPart.substr(':nth-child('.length));
            const index = parentNode.children.indexOf(node);

            return (index === targetIndex - 1 && (type === 'any' || node.type === type));
        }
        else if(cssRuleSelectorPart.indexOf('.') !== -1) { // Example: rect.className
            const cutoff = cssRuleSelectorPart.indexOf('.');
            const typeName = cssRuleSelectorPart.substr(0, cutoff);
            const className = cssRuleSelectorPart.substr(cutoff + 1);
            if(typeName === node.type && node.className && node.className.split(' ').indexOf(className) !== -1) {
                return true;
            }
        }
        return false;
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