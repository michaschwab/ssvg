class SetPropertyQueue {
    [parentSelector: string]: {
        [attrName: string]: {
            [childIndex: number]: string|number
        }
    }
}

export default class VDom {
    
    constructor(public data: {
        width: number,
        height: number,
        scale: number,
        children: any[]
    }) {
        //console.log(data);
    }
    
    addNode(nodeData: any, parentNodeSelector: string) {
        let parentNode = this.getVisNodeFromSelector(parentNodeSelector);
        if(!parentNode) {
            if(parentNodeSelector === "") {
                parentNode = this.data;
            } else {
                console.error(parentNode, parentNodeSelector);
            }
        }
        
        if(!parentNode || !parentNode.children) {
            console.error('parent node not found or no children: ', parentNode, parentNodeSelector, this.data);
        }
        
        parentNode.children.push(nodeData);
    }
    
    updatePropertiesFromQueue(setAttrQueue: SetPropertyQueue) {
        for(let parentSelector in setAttrQueue) {
            if(!parentSelector) {
                console.error(setAttrQueue);
            }
            if(setAttrQueue.hasOwnProperty(parentSelector)) {
                let parentNode;
                if(parentSelector === 'SVG_PARENT') {
                    parentNode = {children: [this.data]};
                } else {
                    parentNode = this.getVisNodeFromSelector(parentSelector);
                }
                if(!parentNode) {
                    console.error(parentNode, parentSelector);
                }
                
                for(let attrName in setAttrQueue[parentSelector]) {
                    if(setAttrQueue[parentSelector].hasOwnProperty(attrName)) {
                        const attrNameStart = attrName.substr(0, 'style;'.length);
                        const attrNameEnd = attrName.substr('style;'.length);
                        for(let childIndex in setAttrQueue[parentSelector][attrName]) {
                            const childNode = parentNode.children[childIndex];
                            if(attrNameStart === 'style;') {
                                childNode['style'][attrNameEnd] = setAttrQueue[parentSelector][attrName][childIndex];
                            } else {
                                childNode[attrName] = setAttrQueue[parentSelector][attrName][childIndex];
                            }
                        }
                    }
                }
            }
        }
    }
    
    private cachedListSelections: {[selector: string]: {[index: number]: HTMLElement}} = {};
    public getVisNodeFromSelector(selector: string): any|null {
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
        
        const selectedNodes: HTMLElement[] = [];
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
    
    private findMatchingChildren(visNode: any, selector: string, matchIndex: number, selectedNodes: any[], selectedNodeSelectors: string[] = []) {
        if(!selector && selector !== '') {
            console.error(visNode, selector, matchIndex, selectedNodes, selectedNodeSelectors);
            throw Error('undefined selector');
        }
        
        let selParts = selector.split('>').map(s => s.trim());
        let selPart = selParts[matchIndex];
        
        if(matchIndex === 0 && selPart === 'svg')
        {
            matchIndex++;
            selPart = selParts[matchIndex];
            if(matchIndex === selParts.length)
            {
                selectedNodes.push(visNode);
                selectedNodeSelectors.push(selector);
                return;
            }
        }
        
        const checker = this.checkIfMatching(selPart);
        
        for(let i = 0; i < visNode.children.length; i++)
        {
            let node = visNode.children[i];
            let matching = false;
            
            if(checker(node, i))
            {
                if(matchIndex === selParts.length - 1)
                {
                    selectedNodes.push(node);
                    selectedNodeSelectors.push(selector);
                }
                else
                {
                    matching = true;
                }
            }
            
            if(node.children && (matching || selParts.length < 2) && matchIndex + 1 < selParts.length)
            {
                this.findMatchingChildren(node, selector, matchIndex + 1, selectedNodes, selectedNodeSelectors);
            }
        }
    }
    
    private checkIfMatching(selPart: string): ((node: any, index?: number) => boolean)
    {
        if(selPart.substr(0,1) === '.')
        {
            return node => (node.class === selPart.substr(1));
        }
        else if(selPart.indexOf(':nth-child(') !== -1)
        {
            let type = 'any';
            let indexPart = selPart;
            
            if(selPart[0] !== ':')
            {
                type = selPart.substr(0, selPart.indexOf(':'));
                indexPart = selPart.substr(selPart.indexOf(':'));
            }
            
            let targetIndex = parseInt(indexPart.substr(':nth-child('.length));
            
            return (node, i) => (i === targetIndex - 1 && (type === 'any' || node.type === type));
        }
        else if(selPart === '') {
            return node => (node.class === 'svg');
        }
        else {
            return node => node.type === selPart;
        }
    }
}