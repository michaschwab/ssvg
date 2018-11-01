//import * as d3 from 'd3';

interface CanvasWorkerMessage {
    cmd: 'INIT'|'UPDATE_NODES'|'UPDATE_SIZE'|'ADD_NODE';
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
    private unassignedNodes: Node[] = [];
    private interactionSelections: HTMLElement[] = [];
    private worker: Worker = new Worker('canvasworker.js');
    private setSize = false;
    private nodesToElements = { nodes: [], elements: []};
    
    constructor(private canvas: HTMLCanvasElement, private svg: SVGElement) {
        this.captureD3On();
    
        this.visData.width = this.svg.getAttribute('width');
        this.visData.height = this.svg.getAttribute('height');
    
        this.setCanvasSize();
        
        const offscreen = (this.canvas as any).transferControlToOffscreen();
        this.sendToWorker({cmd: 'INIT', data: {
                canvas: offscreen,
                visData: this.visData
            }
        }, [offscreen]);
        
        
        window.setTimeout(() => {
            
            this.addChildNodesToVisData(this.svg.childNodes, this.visData.children);
    
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
    
            setTimeout(() => {
                console.log(this.visData);
            }, 1000);
            /*setTimeout(() => {
                this.applyStyles();
            }, 200);*/
        }, 200);
    
        this.replaceNativeCreateElement();
        this.replaceNativeAppend();
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
        console.log('trying to capture "on"');
        if((window as any)['d3']) {
            const d3 = (window as any)['d3'];
            const originalOn = d3.selection.prototype.on;
            const me = this;
    
            d3.selection.prototype.on = function()
            {
                const el = this._parents && this._parents.length ? this._parents[0] : null;
                
                if(el && me.interactionSelections.indexOf(el) === -1)
                {
                    me.interactionSelections.push(el); // This one works for native get/setAttribute
                    //interactionSelections.push(this); // This one works for d3 .attr.
                }
        
                return originalOn.apply(this, arguments);
            };
        }
    }
    
    private replaceNativeCreateElement() {
        const origCreate = document.createElementNS;
        const me = this;
        
        document.createElementNS = function() {
            const el = origCreate.apply(this, arguments);
            
            el.appendChild = () => {
                console.log('hi!!', el, arguments);
            };
            
            me.unassignedNodes.push(el);
    
            //console.log(me.unassignedNodes);
            
            return el;
        }
    }
    
    private replaceNativeAppend() {
        const origAppendChild = Element.prototype.appendChild;
        const me = this;
        
        const newAppend = function<T extends Node>(el: T) {
            //console.log(arguments);
            //console.log(this, el);
    
            //origAppendChild.apply(this, arguments);
    
            el['appendChild'] = <T extends Node>(el2: T) => {
                //console.log('nested add', el2);
                return el2;
            };
            const parentSelector = me.getElementSelectorNew(this);
            (el as any)['parentSelector'] = parentSelector;
            
            const selector = me.getElementSelectorNew(el);
            const parentNode = me.getVisNodeFromSelector(parentSelector);
            //console.log(this, parentSelector);
            (el as any)['selector'] = selector;
            (el as any)['childIndex'] = parentNode.children.length;
            
            //el.parentNode = this.svg;
            
            Object.defineProperty(el, 'parentNode', {
                writable: true,
                value: me.svg
            });
            //(el as any)['parentNode'] = me.svg;
            
            const node = me.getNodeDataFromEl(<HTMLElement><any> el);
            me.nodesToElements.nodes.push(node);
            me.nodesToElements.elements.push(el);
            /*if(el.localName.toLowerCase() === 'circle') {
                console.log(node['r']);
                console.log(JSON.stringify(node));
                
            }*/
            parentNode.children.push(node);
            
            me.applyStylesToNode(node);
    
            //setTimeout(() => {
            me.sendToWorker({
                cmd: 'ADD_NODE',
                data: {
                    node: node,
                    parentNodeSelector: parentSelector
                },
            });
            //}, 300);
    
            if(me.unassignedNodes.indexOf(el) !== -1) {
                const index = me.unassignedNodes.indexOf(el);
                me.unassignedNodes.splice(index, 1);
            }
    
            /*const parent = this;
            
            const returnData: T = <T> { };
            (returnData as any)['setAttribute'] = () => {};
            (returnData as any)['querySelectorAll'] = () => {};
            
            return returnData;*/
            return el;
        };
    
        Element.prototype.appendChild = newAppend;
        Element.prototype.insertBefore = function<T extends Node>(newChild: T, refChild: Node|null) {
    
            newAppend.call(this, newChild);
            
            return newChild;
        };
    }
    
    private replaceNativeAttribute() {
        const origSetAttr = Element.prototype.setAttribute;
        const origSetAttrNS = Element.prototype.setAttributeNS;
        const origGetAttr = Element.prototype.getAttribute;
        const me = this;
    
        Element.prototype.setAttribute = function(name: string, value: any) {
            if(name === 'easypz' || me.unassignedNodes.indexOf(this) !== -1) {
                // Update the original SVG
                origSetAttr.apply(this, arguments);
                return;
            }
            
            //me.updateDataFromElementAttr(this, name, value);
            me.queueSetAttribute(this, name, value);
        };
        Element.prototype.setAttributeNS = function(name: string, value: any) {
            console.log('setAttrNS!!');

            origSetAttrNS.apply(this, arguments);
        };
    
        Element.prototype.getAttribute = function(name) {
        
            if(me.unassignedNodes.indexOf(this) !== -1) {
                return origGetAttr.apply(this, arguments);
            } else {
                return me.getAttributeFromSelector(this, name);
            }
        };
    }
    
    //private setAttrParentElements: Element[] = [];
    private setAttrParentElements: string[] = [];
    private setAttrQueue: {[parentIndex: string]: { [attrName: string]: { [childIndex: number]: any }}} = {};
    private errCount = 0;
    private queueSetAttribute(element: Element, attrName: string, value: any) {
        const parent = (element as any)['parentSelector'] as string;// element.parentElement;
        if(attrName === 'class') {
            attrName = 'className';
            //console.log(value);
        }
        if(!parent) {
            if(this.errCount < 10) {
                console.error(element);
                this.errCount++;
                throw Error('element parent not found');
                
            }
        }
        else {
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
            //const childIndex = this.indexOfChild(element) - 1;
            const childIndex = (element as any)['childIndex'];
            this.setAttrQueue[parentIndex][attrName][childIndex] = value;
        }
        if(attrName === 'className') {
            this.useSetAttributeQueue();
            // To apply classes immediately so styles can be applied correctly.
        }
    }
    
    private lc = 0;
    private useSetAttributeQueue() {
        if(this.lc < 30) {
            //console.log(this.setAttrQueue, this.setAttrParentElements);
        }
        this.lc++;
        this.sendToWorker({
            cmd: 'UPDATE_NODES',
            data: {
                queue: this.setAttrQueue,
                parentNodeSelectors:  this.setAttrParentElements
            },
        });
    
        for(let parentIndex in this.setAttrQueue) {
            const pIndex = parseInt(parentIndex);
            const parentEl = this.setAttrParentElements[pIndex];
            //let parentNode = this.getVisNode(parentEl);
            let parentNode = this.getVisNodeFromSelector(parentEl);
            if(!parentNode) {
                /*if(parentEl === this.svg) {
                    parentNode = this.visData;
                    //console.log(this.setAttrQueue[parentIndex]);
                } else*/ {
                    console.error(parentEl, parentNode, pIndex, parentIndex);
                    console.error(this.visData);
                    console.error(this.unassignedNodes);
                    //console.error()
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
    /*
    private setAttrParentElementsToSelectors() {
        let setAttrParentSelectors: any[] = [];
        
        for(let parentIndex in this.setAttrQueue) {
            const pIndex = parseInt(parentIndex);
            const parentEl = this.setAttrParentElements[pIndex];
            let selector = this.getElementSelector(parentEl);
            setAttrParentSelectors.push(selector);
        }
        
        return setAttrParentSelectors;
    }*/
    
    private getAttributeFromSelector(element: Element, name: string) {
        const node = this.getVisNode(element);
    
        if(!node) {
            return console.error('trying to get attribute for unfit selection', node);
        }
    
        return node[name];
    }
    
    private getVisNode(element: Element): any|null {
        const selector = this.getElementSelectorNew(element);
        
        return this.getVisNodeFromSelector(selector);
    }
    
    private cachedListSelections: {[selector: string]: {[index: number]: HTMLElement}} = {};
    public getVisNodeFromSelector(selector: string): any|null {
        const lastSplitPos = selector.lastIndexOf('>');
        const selectorWithoutLast = selector.substr(0, lastSplitPos).trim();
        const lastPart = selector.substr(lastSplitPos + 1);
        const parentSel = selectorWithoutLast ? this.cachedListSelections[selectorWithoutLast] : null;
        let index = -1;
        const nthChildPosition = lastPart.indexOf(':nth-child(');
        //console.log(nthChildPosition, lastPart);
        if(nthChildPosition !== -1) {
            index = parseInt(lastPart.substr(nthChildPosition + 11)); // length of ':nth-child('
            //console.log(index, parentSel, selectorWithoutLast);
            if(parentSel && parentSel[index]) {
                return parentSel[index];
            }
        }
        
        const selectedNodes: HTMLElement[] = [];
        this.findMatchingChildren(this.visData, selector, 0, selectedNodes);
        //console.log(selectedNodes, selector);
        
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
            return node => (node.className === selPart.substr(1));
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
            return node => (node.className === 'svg');
        }
        else {
            return node => node.type === selPart;
        }
    }
    
    private getNodeDataFromEl(el: HTMLElement) {
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
    
    private applyStylesToNode(node: any) {
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
        
        return checkNode(this.visData);
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
        
        return checkNode(this.visData);
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
    
    private getElementSelectorNew(element: Element): string {
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
                
                let node = this.getVisNodeFromSelector(parentSelector);
                if(!node) {
                    console.error(parentSelector, this.visData);
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
            let parentSelector = this.getElementSelectorNew(interactionSel);
            let parentNode = this.getVisNodeFromSelector(parentSelector);
            //console.log(parentNode);
            //let matchingVisParent = selectedNodes[i];
            let j = 1;
            
            if(!parentNode) {
                //console.error(interactionSel, parentSelector, parentNode);
            } else {
                for(let el of parentNode.children)
                {
                    if(this.nodeAtPosition(el, new_event.clientX-10, new_event.clientY-10))
                    {
                        /*let selector = parentSelector + ' > :nth-child(' + j + ')';
                        let svgEl = this.svg.querySelector(selector);*/
                        const nodeIndex = this.nodesToElements.nodes.indexOf(el);
                        const svgEl = this.nodesToElements.elements[nodeIndex];
            
                        if(svgEl) {
                            svgEl.dispatchEvent(new_event);
                        }
                    }
                    j++;
                }
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