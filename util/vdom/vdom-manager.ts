import DrawingUtils from "../../canvasworker/drawingUtils";
import SetPropertyQueueData, {AttrValues} from "./set-property-queue-data";
import {VDOM, VdomNode} from "./vdom";
import {SsvgElement} from "../../frontend/domhandler";

export class VdomManager {
    private sharedData: {[attrName: string]: Int32Array} = {};
    private sharedDataQueue: {[attrName: string]: Int32Array} = {};
    private sharedDataQueueBuffers: {[attrName: string]: SharedArrayBuffer} = {};
    private queue: SetPropertyQueueData = {};
    private useSharedArrayFor = ['cx', 'cy', 'x1', 'x2', 'y1', 'y2', 'x', 'y'];
    private static IGNOREDESIGN_ATTRIBUTES = ['fill', 'stroke', 'opacity'];
    private indexToNodeMap: {[index: number]: VdomNode} = {};
    private static BUFFER_PRECISION_FACTOR = 10;
    private changed = false;

    constructor(public data: VDOM, private ignoreDesign: boolean) {
        this.ensureNodesMapped();
    }

    ensureInitialized(attrName: string, useBuffer = true, numNodes?: number) {
        if(attrName === 'class') {
            attrName = 'className';
        }

        if(!useBuffer || this.useSharedArrayFor.indexOf(attrName) === -1) {
            if(!this.queue[attrName]) {
                this.queue[attrName] = {};
            }
        } else {
            const newLength = numNodes < 500 ? 1000 : Math.round(numNodes * 2);

            if(!this.sharedData[attrName]) {
                let prevData: AttrValues;

                // If values have been previously set without a buffer, transfer them.
                if(this.queue[attrName] && !(this.queue[attrName] instanceof SharedArrayBuffer)) {
                    prevData = <AttrValues> this.queue[attrName];
                }

                const {buffer, values} = this.createBufferTransferValues(newLength, prevData);
                this.sharedDataQueue[attrName] = values;
                this.sharedDataQueueBuffers[attrName] = buffer;
            } else {
                const newByteLength = Int32Array.BYTES_PER_ELEMENT * newLength;
                if(this.sharedData[attrName].byteLength / newByteLength < 0.6) {
                    // Need to allocate more space
                    const {buffer, values} = this.createBufferTransferValues(newLength,
                        this.sharedDataQueue[attrName]);
                    this.sharedDataQueue[attrName] = values;
                    this.sharedDataQueueBuffers[attrName] = buffer;
                }
            }
        }
    }

    createBufferTransferValues(length: number, prevData?: AttrValues) {
        const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * length);
        const values = new Int32Array(buffer);

        // If values have been previously set without a buffer, transfer them.
        if(prevData) {
            for(const index in prevData) {
                if(prevData.hasOwnProperty(index)) {
                    let value = prevData[index];
                    if(typeof value === 'string') {
                        value = parseFloat(value);
                    }
                    values[index] = value * VdomManager.BUFFER_PRECISION_FACTOR;
                }
            }
        }

        return {buffer, values};
    }

    set(element: VdomNode|SsvgElement, attrName: string, value: string|number, useBuffer = true) {
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
            this.changed = true;
            if(storage === 'shared') {
                if(typeof value === 'string') {
                    value = parseFloat(value);
                }
                value *= VdomManager.BUFFER_PRECISION_FACTOR;
                value = Math.round(value); // This helps detect zeros.
                if(value === 0) {
                    value = 56938516; // magical constant
                }

                this.sharedDataQueue[attrName][index] = value;
            } else {
                this.queue[attrName][index] = value;
                if(this.sharedDataQueue[attrName] && this.sharedData[attrName][index]) {
                    // un-set.
                    this.sharedDataQueue[attrName][index] = 0;
                }
            }
        }
        catch(e) {
            console.error(e);
            console.log(this.queue, this.sharedData, storage, attrName, element, index);
        }
    }

    removePendingChanges(node: VdomNode) {
        const index = node.globalElementIndex;
        for(const attrName in this.queue) {
            if(this.queue.hasOwnProperty(attrName)) {
                delete this.queue[attrName][index];
            }
        }
        for(const attrName in this.sharedData) {
            if(this.sharedDataQueue.hasOwnProperty(attrName)) {
                this.sharedDataQueue[attrName][index] = 0;
            }
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

    addNodeToParent(nodeData: VdomNode, parentNodeIndex: number) {
        if(nodeData.type !== 'svg') {
            const parentNode = this.getNodeFromIndex(parentNodeIndex);
            if(!parentNode) {
                console.error('could not add node without parent', parentNodeIndex, nodeData,
                    Object.keys(this.indexToNodeMap));
                new Error('parent not found');
                return;
            }
            this.applyParentStyles(parentNode, nodeData);
            parentNode.children.push(nodeData);
        }
    }

    addNode(node: VdomNode) {
        this.indexToNodeMap[node.globalElementIndex] = node;
    }

    removeNode(node: VdomNode, parent: VdomNode) {
        delete this.indexToNodeMap[node.globalElementIndex];
        const childIndex = parent.children.indexOf(node);

        parent.children.splice(childIndex, 1);
        this.cachedListSelections = {}; //TODO only remove relevant cache.

        this.removePendingChanges(node);
    }

    applyParentStyles(parentNode: VdomNode, childNode: VdomNode) {
        for(const style in parentNode.style) {
            if(!childNode.style[style]) {
                childNode.style[style] = parentNode.style[style];
            }
        }
    }

    applyStyleToNodeAndChildren(node: VdomNode, styleName: string, styleValue: string,
                                onNodeUpdated: (node: VdomNode, attrName: string) => void) {
        node.style[styleName] = styleValue;
        onNodeUpdated(node, styleName);

        if(node.children) {
            for(let child of node.children) {
                this.applyStyleToNodeAndChildren(child, styleName, styleValue, onNodeUpdated);
            }
        }
    }

    applyCssToNodeAndChildren(node: VdomNode, selector: string, styleName: string, value: string,
                              onNodeUpdated: (node: VdomNode, attrName: string) => void) {
        if(styleName === '*' && !value) {
            delete node.css[selector];
        } else {
            if(!node.css[selector]) {
                node.css[selector] = {};
            }
            node.css[selector][styleName] = value;
        }
        onNodeUpdated(node, styleName);

        if(node.children) {
            for(let child of node.children) {
                this.applyCssToNodeAndChildren(child, selector, styleName, value, onNodeUpdated);
            }
        }
    }

    getNodeFromIndex(index: number): VdomNode {
        return this.indexToNodeMap[index];
    }

    getNodeById(id: string): VdomNode {
        const filtered = Object.values(this.indexToNodeMap).filter(node => node.id === id);
        if(!filtered || filtered.length > 1) {
            safeLog('multiple nodes with this id!', Object.values(this.indexToNodeMap)
                .filter(node => node.id).map(node => node.id), id);
            safeLog(filtered.length, filtered);
        }
        return !filtered || filtered.length !== 1 ? null : filtered[0];
    }

    private static ROUNDED_ATTRS = ['cx', 'cy'];

    get(node: VdomNode, attrs: string|string[]) {
        if(Array.isArray(attrs)) {
            return attrs.map(attrName => this.getSingle(node, attrName));
        } else {
            return this.getSingle(node, attrs);
        }
    }

    private getSingle(node: VdomNode, attrName: string) {
        if(this.sharedData[attrName] && this.sharedData[attrName][node.globalElementIndex]) {
            const value = this.sharedData[attrName][node.globalElementIndex];
            if(value === 56938516) {
                return 0;
            }
            return value / VdomManager.BUFFER_PRECISION_FACTOR;
        } else {
            return node[attrName];
        }
    }

    hasChanges() {
        return this.changed;
    }

    getQueue() {
        return this.queue;
    }

    clearQueue() {
        this.queue = {};
        this.changed = false;
    }

    transferBufferQueueData() {
        for(let attrName in this.sharedDataQueue) {
            this.queue[attrName] = this.sharedDataQueueBuffers[attrName];
            this.sharedData[attrName] = this.sharedDataQueue[attrName];

            const length = this.sharedData[attrName].byteLength / Int32Array.BYTES_PER_ELEMENT;
            const {buffer, values} = this.createBufferTransferValues(length);

            this.sharedDataQueueBuffers[attrName] = buffer;
            this.sharedDataQueue[attrName] = values;
        }
    }

    updatePropertiesFromQueue(setAttrQueue: SetPropertyQueueData,
                              onNodeUpdated: (node: VdomNode, attrName: string) => void = () => {}) {
        for(let attrName in setAttrQueue) {
            if(!setAttrQueue.hasOwnProperty(attrName)) {
                continue;
            }
            const attrNameStart = attrName.substr(0, 'style;'.length);
            if(this.ignoreDesign && (attrNameStart === 'style;' ||
                VdomManager.IGNOREDESIGN_ATTRIBUTES.indexOf(attrName) !== -1)) {
                continue;
            }

            let values: AttrValues|Int32Array;

            if('SharedArrayBuffer' in self &&
                setAttrQueue[attrName] instanceof SharedArrayBuffer) {
                this.sharedData[attrName] = new Int32Array(<ArrayBuffer> setAttrQueue[attrName]);
            } else {
                values = setAttrQueue[attrName] as string[];

                for(let childIndex in values) {
                    if(!values.hasOwnProperty(childIndex)) {
                        continue;
                    }
                    const index = parseInt(childIndex);
                    const childNode = this.getNodeFromIndex(index);
                    if(!childNode) {
                        console.error('node not found at index', index)
                        continue;
                    }
                    let value: string|number = values[childIndex];
                    if(attrNameStart === 'style;') {
                        const styleName = attrName.substr('style;'.length);
                        this.applyStyleToNodeAndChildren(childNode, styleName, <string> value, onNodeUpdated);
                    } else if(attrName.substr(0, 4) === 'css;') {
                        const [selector, styleName] = attrName.substr(4).split(';');
                        this.applyCssToNodeAndChildren(childNode, selector, styleName, <string> value, onNodeUpdated);
                    } else {
                        if(VdomManager.ROUNDED_ATTRS.indexOf(attrName) !== -1) {
                            if(typeof value === 'string') {
                                value = parseFloat(value);
                            }
                            value = Math.round(value);
                        }

                        childNode[attrName] = value;
                        onNodeUpdated(childNode, attrName);
                    }
                }
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
    if(safeLogCount < 400) {
        safeLogCount++;
        console.log(...logContents);
    }
}
function safeErrorLog(...logContents) {
    if(safeLogCount < 400) {
        safeLogCount++;
        console.error(...logContents);
    }
}
