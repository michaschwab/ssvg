import DrawingUtils from "../../canvasworker/drawingUtils";
import SetPropertyQueueData from "./set-property-queue-data";
import {VDOM, VdomNode} from "./vdom";
import {SsvgElement} from "../../frontend/domhandler";

export class VdomManager {
    private sharedData: {[attrName: string]: Int32Array} = {};
    private queue: SetPropertyQueueData = {};
    private useSharedArrayFor = ['cx', 'cy', 'x1', 'x2', 'y1', 'y2', 'x', 'y'];
    private static IGNOREDESIGN_ATTRIBUTES = ['fill', 'stroke', 'opacity'];
    private indexToNodeMap: {[index: number]: VdomNode} = {};
    private static BUFFER_PRECISION_FACTOR = 10;
    
    constructor(public data: VDOM, private ignoreDesign: boolean) {
        this.ensureNodesMapped();
    }

    ensureInitialized(attrName: string, useBuffer: boolean, numNodes?: number) {
        if(attrName === 'class') {
            attrName = 'className';
        }

        if(!useBuffer || this.useSharedArrayFor.indexOf(attrName) === -1) {
            if(!this.queue[attrName]) {
                this.queue[attrName] = [];
            }
        } else {
            if(!this.sharedData[attrName]) {
                const length = numNodes < 500 ? 1000 : numNodes * 2;
                const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * length);
                const values = new Int32Array(buffer);

                // If values have been previously set without a buffer, transfer them.
                if(this.queue[attrName] &&
                    !(this.queue[attrName] instanceof SharedArrayBuffer)) {
                    const prevData: string[] = <any> this.queue[attrName];

                    prevData.forEach((value, index) => {
                        values[index] = parseFloat(value) * VdomManager.BUFFER_PRECISION_FACTOR;
                    });
                }

                this.queue[attrName] = buffer;
                this.sharedData[attrName] = values;
            } else {
                const newLength = numNodes < 500 ? 1000 : numNodes * 2;
                const newByteLength = Int32Array.BYTES_PER_ELEMENT * newLength;
                if(this.sharedData[attrName].byteLength / newByteLength < 0.8) {
                    // Need to allocate more space
                    //console.log('more space needed. prev:', this.sharedData[attrName].byteLength / Int32Array.BYTES_PER_ELEMENT, 'new', newLength);
                    const buffer = new SharedArrayBuffer(newByteLength);
                    const values = new Int32Array(buffer);
                    const oldVals = new Int32Array(this.sharedData[attrName]);

                    for(const i in oldVals) {
                        values[i] = oldVals[i];
                    }
                    this.queue[attrName] = buffer;
                    this.sharedData[attrName] = values;
                }
            }
        }
    }

    set(element: VdomNode|SsvgElement, attrName: string, value: any, useBuffer: boolean) {
        if(attrName === 'class') {
            attrName = 'className';
        }
        if(element.globalElementIndex === undefined) {
            console.error('No index', element);
            throw new Error('Element has no index');
        }
        const index = element.globalElementIndex;
        const storage = useBuffer && this.useSharedArrayFor.indexOf(attrName) !== -1 ? 'shared' : 'raw';
        try {
            if(storage === 'shared') {
                value *= VdomManager.BUFFER_PRECISION_FACTOR;
                if(value === 0) {
                    value = 133713371337; // magical constant
                }
                this.sharedData[attrName][index] = value;
            } else {
                this.queue[attrName][index] = value;
            }
        }
        catch(e) {
            console.error(e);
            console.log(this.queue, this.sharedData, storage, attrName, element, index);
        }
    }

    ensureNodesMapped() {
        const addToMap = (node: VdomNode) => {
            if(node.globalElementIndex === undefined) {
                console.error('no element index', node);
            }
            this.indexToNodeMap[node.globalElementIndex] = node;
            for(const child of node.children) {
                addToMap(child);
            }
        };
        addToMap(this.data);
    }

    enableFrontendDesignProperties() {
        this.ignoreDesign = false;
    }
    
    addNode(nodeData: VdomNode, parentNodeIndex: number) {
        let parentNode = this.getNodeFromIndex(parentNodeIndex);
        if(!parentNode) {
            console.error('could not add node without parent', parentNodeIndex, nodeData, JSON.stringify(Object.keys(this.indexToNodeMap)));
            new Error('parent not found');
            return;
        }
        this.applyParentStyles(parentNode, nodeData);
        
        parentNode.children.push(nodeData);
        this.indexToNodeMap[nodeData.globalElementIndex] = nodeData;
        return nodeData;
    }

    removeNode(childIndex: number, parentNodeIndex: number) {
        const parentNode = this.getNodeFromIndex(parentNodeIndex);

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

    getNodeFromIndex(index: number): VdomNode {
        return this.indexToNodeMap[index];
    }

    getNodeById(id: string): VdomNode {
        const filtered = Object.values(this.indexToNodeMap).filter(node => node.id === id);
        if(!filtered || filtered.length !== 1) {
            safeLog('node not found', Object.values(this.indexToNodeMap)
                .filter(node => node.id).map(node => node.id), id);
            safeLog(filtered.length, filtered);
        }
        return !filtered || filtered.length !== 1 ? null : filtered[0];
    }

    private static ROUNDED_ATTRS = ['cx', 'cy'];

    get(node: VdomNode, attrName: string) {
        if(this.sharedData[attrName] && this.sharedData[attrName][node.globalElementIndex]) {
            if(this.sharedData[attrName][node.globalElementIndex] === 133713371337) {
                return 0;
            }
            return this.sharedData[attrName][node.globalElementIndex] / VdomManager.BUFFER_PRECISION_FACTOR;
        } else {
            return node[attrName];
        }
    }

    getQueueValue(node: VdomNode, attrName: string) {
        return this.queue[attrName][node.globalElementIndex];
    }

    getQueue() {
        return this.queue;
    }

    clearQueue() {
        this.queue = {};
    }

    updatePropertiesFromQueue(setAttrQueue: SetPropertyQueueData) {
                
        for(let attrName in setAttrQueue) {
            if(!setAttrQueue.hasOwnProperty(attrName)) {
                continue;
            }
            const attrNameStart = attrName.substr(0, 'style;'.length);
            if(this.ignoreDesign && (attrNameStart === 'style;' ||
                VdomManager.IGNOREDESIGN_ATTRIBUTES.indexOf(attrName) !== -1)) {
                continue;
            }

            let values: string[]|Int32Array;

            if('SharedArrayBuffer' in self &&
                setAttrQueue[attrName] instanceof SharedArrayBuffer) {
                this.sharedData[attrName] = new Int32Array(<ArrayBuffer> setAttrQueue[attrName]);
            } else {
                values = setAttrQueue[attrName] as string[];

                for(let childIndex in values) {
                    // This skips all values that are 0 because the SharedArrayBuffer fills up with zeros.
                    //TODO(michaschwab): Find a solution for zero values.
                    if(!values.hasOwnProperty(childIndex)) {
                        continue;
                    }
                    /*if(values[childIndex] === 0) {
                        continue;
                    }*/
                    const index = parseInt(childIndex);
                    const childNode = this.getNodeFromIndex(index);
                    if(!childNode) {
                        console.error('node not found at index', index)
                        continue;
                    }
                    let value: string|number = values[childIndex];
                    if(attrNameStart === 'style;') {
                        const styleName = attrName.substr('style;'.length);
                        const specificityAttrName = 'styleSpecificity;' + styleName;
                        try {
                            const matchingSpecificity: number = setAttrQueue[specificityAttrName][childIndex];
                            this.applyStyleToNodeAndChildren(childNode, styleName, <string> value, matchingSpecificity);
                            this.updateDeducedStyles(childNode, styleName, <string> value);
                        } catch (e) {
                            console.error(e, setAttrQueue, specificityAttrName, childIndex);
                            this.applyStyleToNodeAndChildren(childNode, styleName, <string> value, -1);
                        }

                    } else {
                        if(VdomManager.ROUNDED_ATTRS.indexOf(attrName) !== -1) {
                            value = Math.round(<number> parseFloat(value));
                        }
                        childNode[attrName] = value;
                        this.updateDeducedStyles(childNode, attrName, <string> value);
                    }
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
