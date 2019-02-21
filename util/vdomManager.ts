import DrawingUtils from "../canvasworker/drawingUtils";

export class SetPropertyQueue {
    [parentSelector: string]: {
        [attrName: string]:
            string[]|SharedArrayBuffer
        
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
    width?: number,
    height?: number,
    textAlign?: string,
    text?: string,
    className?: string,
    id?: string,
}

export class VdomManager {
    
    constructor(public data: VDOM, private ignoreDesign = false) {
        //console.log(data);
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
            console.error(parentNode, parentSelector);
        }
        return parentNode;
    }

    applyStyleToNodeAndChildren(node: VdomNode, styleName: string, styleValue: string) {
        node['style'][styleName] = styleValue;

        if(node.children) {
            for(let child of node.children) {
                this.applyStyleToNodeAndChildren(child, styleName, styleValue);
            }
        }
    }

    updatePropertiesFromQueue(setAttrQueue: SetPropertyQueue) {
        for(let parentSelector in setAttrQueue) {
            const parentNode = this.getParentNodeFromSelector(parentSelector);
                
            for(let attrName in setAttrQueue[parentSelector]) {
                const attrNameStart = attrName.substr(0, 'style;'.length);

                if(this.ignoreDesign && (attrNameStart === 'style;' ||
                    ['fill', 'stroke', 'opacity', 'x1', 'x2', 'y1', 'y2'].indexOf(attrName) !== -1)) {
                    continue;
                }
                
                let values;
                let factor;
                
                if('SharedArrayBuffer' in window &&
                    setAttrQueue[parentSelector][attrName] instanceof SharedArrayBuffer) {
                    values = new Int32Array(<ArrayBuffer> setAttrQueue[parentSelector][attrName]);
                    factor = 0.1;
                } else {
                    values = setAttrQueue[parentSelector][attrName];
                }
                
                for(let childIndex in values) {
                    const childNode = parentNode.children[childIndex];
                    if(!childNode) {
                        continue;
                    }
                    const value = factor ? factor * values[childIndex] : values[childIndex];
                    if(attrNameStart === 'style;') {
                        const styleName = attrName.substr('style;'.length);
                        this.applyStyleToNodeAndChildren(childNode, styleName, value);
                        this.updateDeducedStyles(childNode, styleName, value);
                    } else {
                        childNode[attrName] = value;
                        this.updateDeducedStyles(childNode, attrName, value);
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
    
    public getVisNodesFromSelector(visNode, selector: string) {
        const selectedNodes = [];
        this.findMatchingChildren(visNode, selector, 0, selectedNodes);
        return selectedNodes;
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
        
        const checker = this.checkIfMatching(selPart);
        
        for(let i = 0; i < visNode.children.length; i++) {
            let node = visNode.children[i];
            let matching = false;
            
            if(checker(node, i)) {
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
    
    private checkIfMatching(selPart: string): ((node: VdomNode, index?: number) => boolean) {
        if(selPart.substr(0,1) === '.') {
            return node => (node.className && node.className === selPart.substr(1));
        } else if(selPart.substr(0,1) === '#') {
            return node => (node.id && node.id === selPart.substr(1));
        } else if(selPart.indexOf(':nth-child(') !== -1) {
            let type = 'any';
            let indexPart = selPart;
            
            if(selPart[0] !== ':') {
                type = selPart.substr(0, selPart.indexOf(':'));
                indexPart = selPart.substr(selPart.indexOf(':'));
            }
            
            let targetIndex = parseInt(indexPart.substr(':nth-child('.length));
            
            return (node, i) => (i === targetIndex - 1 && (type === 'any' || node.type === type));
        } else if(selPart === '') {
            console.log('node class?'); //TODO remove if not used
            return node => (node['class'] === 'svg');
        } else {
            return node => node.type === selPart;
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