//import * as d3 from 'd3';

interface CanvasWorkerMessage {
    cmd: 'INIT'|'UPDATE_NODES'|'UPDATE_SIZE';
    data?: any;
}

function roughSizeOfObject( object: any ) {
    
    var objectList = [];
    var stack = [ object ];
    var bytes = 0;
    
    while ( stack.length ) {
        var value = stack.pop();
        
        if ( typeof value === 'boolean' ) {
            bytes += 4;
        }
        else if ( typeof value === 'string' ) {
            bytes += value.length * 2;
        }
        else if ( typeof value === 'number' ) {
            bytes += 8;
        }
        else if
        (
            typeof value === 'object'
            && objectList.indexOf( value ) === -1
        )
        {
            objectList.push( value );
            
            for( var i in value ) {
                stack.push( value[ i ] );
            }
        }
    }
    return bytes;
}

export default class SvgToCanvas {
    private visData: any = {
        width: 0,
        height: 0,
        scale: 1,
        children: []
    };
    private interactionSelections: HTMLElement[] = [];
    private worker: Worker = new Worker('canvasworker.js');
    private setSize = false;
    
    constructor(private canvas: HTMLCanvasElement, private svg: SVGElement) {
        this.captureD3On();
        
        
        window.setTimeout(() => {
            this.visData.width = this.svg.getAttribute('width');
            this.visData.height = this.svg.getAttribute('height');
            
            this.setCanvasSize();
            
            this.addChildNodesToVisData(this.svg.childNodes, this.visData.children);
    
            const offscreen = (this.canvas as any).transferControlToOffscreen();
            this.sendToWorker({cmd: 'INIT', data: {
                    canvas: offscreen,
                    visData: this.visData
                }
            }, [offscreen]);
    
            this.drawCanvas();
            this.svg.style.display = 'none';
    
            canvas.addEventListener('mousedown', e => this.propagateMouseEvent(e));
            canvas.addEventListener('mousemove', e => this.propagateMouseEvent(e));
            canvas.addEventListener('mouseup', e => this.propagateMouseEvent(e));
            canvas.addEventListener('wheel', e => this.propagateWheelEvent(e));
    
            this.replaceNativeAttribute();
            
            const recursiveRaf = () => {
                this.drawCanvas();
                requestAnimationFrame(recursiveRaf);
            };
            requestAnimationFrame(recursiveRaf);
        }, 200);
    }
    
    private setCanvasSize() {
        this.visData.scale = window.devicePixelRatio;
    
        this.canvas.style.width = this.visData.width + 'px';
        this.canvas.style.height = this.visData.height + 'px';
        this.canvas.width = this.visData.width * this.visData.scale;
        this.canvas.height = this.visData.height * this.visData.scale;
    
        this.setSize = true;
    }
    
    private drawCanvas() {
        this.useSetAttributeQueue();
    }
    
    private captureD3On() {
        if((window as any)['d3']) {
            const d3 = (window as any)['d3'];
            const originalOn = d3.selection.prototype.on;
            const me = this;
    
            d3.selection.prototype.on = function()
            {
                const el = this.node() ? this.node().parentNode : null;
        
                if(el && me.interactionSelections.indexOf(el) === -1)
                {
                    me.interactionSelections.push(el); // This one works for native get/setAttribute
                    //interactionSelections.push(this); // This one works for d3 .attr.
                }
        
                return originalOn.apply(this, arguments);
            };
        }
    }
    
    private replaceNativeAttribute() {
        let origSetAttr = Element.prototype.setAttribute;
        let origGetAttr = Element.prototype.getAttribute;
        const me = this;
    
        Element.prototype.setAttribute = function(name: string, value: any) {
            if(name === 'easypz') {
                // Update the original SVG
                origSetAttr.apply(this, arguments);
                return;
            }
            
            //me.updateDataFromElementAttr(this, name, value);
            me.queueSetAttribute(this, name, value);
        };
    
        Element.prototype.getAttribute = function(name) {
            let selector = me.getElementSelector(this);
        
            if(!selector) {
                return origGetAttr.apply(this, arguments);
            } else {
                return me.getAttributeFromSelector(this, name);
            }
        };
    }
    
    private setAttrParentElements: Element[] = [];
    private setAttrQueue: {[parentIndex: string]: { [attrName: string]: { [childIndex: number]: any }}} = {};
    
    private queueSetAttribute(element: Element, attrName: string, value: any) {
        const parent = element.parentElement;
        if(!parent) {
            throw Error('element parent not found');
        }
        let parentIndex = this.setAttrParentElements.indexOf(parent);
        if(parentIndex === -1) {
            parentIndex = this.setAttrParentElements.length;
            this.setAttrParentElements.push(parent);
        }
        if(!this.setAttrQueue[parentIndex]) {
            this.setAttrQueue[parentIndex] = {};
        }
        if(!this.setAttrQueue[parentIndex][attrName]) {
            this.setAttrQueue[parentIndex][attrName] = {};
        }
        const childIndex = this.indexOfChild(element) - 1;
        this.setAttrQueue[parentIndex][attrName][childIndex] = value;
    }
    
    private useSetAttributeQueue() {
        this.sendToWorker({
            cmd: 'UPDATE_NODES',
            data: {
                queue: this.setAttrQueue,
                parentNodes:  this.setAttrParentElementsToSelectors()
            },
        });
    
        for(let parentIndex in this.setAttrQueue) {
            const pIndex = parseInt(parentIndex);
            const parentEl = this.setAttrParentElements[pIndex];
            let parentNode = this.getVisNode(parentEl);
            if(!parentNode) {
                if(parentEl === this.svg) {
                    parentNode = this.visData;
                    //console.log(this.setAttrQueue[parentIndex]);
                } else {
                    console.error(parentEl, parentNode, pIndex, parentIndex);
                }
            }
        
            for(let attrName in this.setAttrQueue[parentIndex]) {
                if(this.setAttrQueue[parentIndex].hasOwnProperty(attrName)) {
                    for(let childIndex in this.setAttrQueue[parentIndex][attrName]) {
                        const childNode = parentNode.children[childIndex];
                        //console.log(parentNode, childIndex);
                        childNode[attrName] = this.setAttrQueue[parentIndex][attrName][childIndex];
                    }
                }
            }
        }
    
        this.setAttrQueue = {};
    }
    
    private setAttrParentElementsToSelectors() {
        let setAttrParentSelectors: any[] = [];
        
        for(let parentIndex in this.setAttrQueue) {
            const pIndex = parseInt(parentIndex);
            const parentEl = this.setAttrParentElements[pIndex];
            let selector = this.getElementSelector(parentEl);
            setAttrParentSelectors.push(selector);
        }
        
        return setAttrParentSelectors;
    }
    
    private getAttributeFromSelector(element: Element, name: string) {
        const node = this.getVisNode(element);
    
        if(!node) {
            return console.error('trying to get attribute for unfit selection', node);
        }
    
        return node[name];
    }
    
    private getVisNode(element: Element): any|null {
        const selector = this.getElementSelector(element);
        
        return this.getVisNodeFromSelector(selector);
    }
    
    private cachedListSelections: {[selector: string]: {[index: number]: HTMLElement}} = {};
    private getVisNodeFromSelector(selector: string): any|null {
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
        this.findMatchingChildren(this.visData, selector, 0, selectedNodes);
        
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
    
    private addChildNodesToVisData(childEls: HTMLElement[]|NodeList, childrenData: any): void {
        const getRoundedAttr = (el: Element, attrName: string) => {
            const val = el.getAttribute(attrName);
            return val ? parseFloat(val) : null;
        };
        for(let i  = 0; i < childEls.length; i++) {
            let el = childEls[i] as HTMLElement;
            
            try
            {
                let win = document.defaultView || window;
                let style = win.getComputedStyle(el, '');
                
                let node = {
                    type: el.tagName.toLowerCase(),
                    transform: el.getAttribute('transform'),
                    d: el.getAttribute('d'),
                    class: el.getAttribute('class'),
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
                        stroke: style.getPropertyValue('stroke'),
                        "stroke-opacity": parseFloat(style.getPropertyValue('stroke-opacity')),
                        "stroke-width": parseFloat(style.getPropertyValue('stroke-width')),
                        fill: style.getPropertyValue('fill'),
                        textAnchor: style.textAnchor
                    },
                    children: []
                };
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
    
    private getElementSelector(element: Element): string {
        let sel = (element as any)['selector'];
    
        if(sel)
        {
            return sel;
        }
        else
        {
            sel = this.getElementSelectorByTraversing(element, this.svg);
            (element as any)['selector'] = sel;
        
            return sel;
        }
    }
    
    //TODO
    /*private getElementParentSelectorAndIndex(element: HTMLElement): [string, number] {
    
    }*/
    
    private getElementSelectorByTraversing(element: Element, parentToStopAt: Element|SVGElement): string {
        let path = '', node = element;
        while (node && node !== parentToStopAt) {
            let name = node.localName;
            
            if (!name) break;
            name = name.toLowerCase();
        
            const parent = node.parentElement;
            if(!parent) break;
            
            const siblings = parent.children;
            if (siblings.length > 1) {
                name += ':nth-child(' + (this.indexOfChild(node)) + ')';
            }
        
            path = name + (path ? '>' + path : '');
            node = parent;
        }
    
        return node !== parentToStopAt ? '' : path;
    }
    
    private childIndexCache: {
        elements: Element[],
        indeces: number[]
    } = {
        elements: [],
        indeces: []
    };
    private indexOfChild(child: Element): number {
        let cacheIndex = this.childIndexCache.elements.indexOf(child);
        if(cacheIndex !== -1) {
            return this.childIndexCache.indeces[cacheIndex];
        }
        
        let i = 0;
        let siblingOrNull: Element|null = child;
        
        while(siblingOrNull)
        {
            siblingOrNull = siblingOrNull.previousElementSibling;
            i++;
        }
        this.childIndexCache.elements.push(child);
        this.childIndexCache.indeces.push(i);
        return i;
    }
    
    private propagateMouseEvent(evt: MouseEvent) {
        return this.propagateEvent(new MouseEvent(evt.type, evt));
    }
    
    private propagateWheelEvent(evt: WheelEvent) {
        return this.propagateEvent(new WheelEvent(evt.type, evt));
    }
    
    private propagateEvent(new_event: MouseEvent|WheelEvent): void {
        this.svg.dispatchEvent(new_event); // for EasyPZ
    
        for(let interactionSel of this.interactionSelections)
        {
            let parentSelector = this.getElementSelector(interactionSel);
            let parentNode = this.getVisNodeFromSelector(parentSelector);
            //let matchingVisParent = selectedNodes[i];
            let j = 1;
        
            for(let el of parentNode.children)
            {
                if(this.nodeAtPosition(el, new_event.clientX-10, new_event.clientY-10))
                {
                    let selector = parentSelector + ' > :nth-child(' + j + ')';
                    let svgEl = this.svg.querySelector(selector);
                    
                    if(svgEl) {
                        svgEl.dispatchEvent(new_event);
                    }
                }
                j++;
            }
        }
    }
    
    private nodeAtPosition(visNode: any, x: number, y: number): boolean
    {
        if(visNode.type === 'circle')
        {
            let distance = Math.sqrt(Math.pow(visNode.cx - x, 2) + Math.pow(visNode.cy - y, 2));
            return distance < visNode.r;
        }
        return false;
    }
    
    private sendToWorker(msg: CanvasWorkerMessage, data?: any) {
        this.worker.postMessage(msg, data);
        //console.log(roughSizeOfObject(msg));
    }
}