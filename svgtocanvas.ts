//import * as d3 from 'd3';

export default class SvgToCanvas {
    private visData: any;
    private ctx: CanvasRenderingContext2D;
    private interactionSelections: HTMLElement[] = [];
    
    constructor(private canvas: HTMLCanvasElement, private svg: SVGElement) {
    
        this.captureD3On();
        const ctx = canvas.getContext('2d');
        if(!ctx) throw new Error('could not create canvas context');
        
        this.ctx = ctx;
        this.visData = {
            width: 0,
            height: 0,
            children: []
        };
        
        window.setTimeout(() => {
            this.visData.width = this.svg.getAttribute('width');
            this.visData.height = this.svg.getAttribute('height');
            this.addChildNodesToVisData(this.svg.childNodes, this.visData.children);
    
            this.drawCanvas();
            this.svg.style.display = 'none';
    
            canvas.addEventListener('mousedown', e => this.propagateEvent(e));
            canvas.addEventListener('mousemove', e => this.propagateEvent(e));
            canvas.addEventListener('mouseup', e => this.propagateEvent(e));
            canvas.addEventListener('wheel', e => this.propagateEvent(e));
    
            this.replaceNativeAttribute();
            
            const recursiveRaf = () => {
                this.drawCanvas();
                requestAnimationFrame(recursiveRaf);
            };
            requestAnimationFrame(recursiveRaf);
        }, 500);
    }
    
    private lastDrawn: any = null;
    private queues: { circles: any } = {
        circles: {}
    };
    
    private setSize = false;
    
    drawCanvas() {
        const canvas = this.canvas;
        const ctx = this.ctx;
        //console.log(ctx.getTransform());
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        //let offscreenCanvas = document.createElement('canvas');
        //let offscreenCtx = offscreenCanvas.getContext('2d');
        let scale = window.devicePixelRatio;
        
        if(!this.setSize) {
            canvas.style.width = this.visData.width + 'px';
            canvas.style.height = this.visData.height + 'px';
            canvas.width = this.visData.width * scale;
            canvas.height = this.visData.height * scale;
            
            ctx.scale(scale, scale);
    
            this.setSize = true;
        } else {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, this.visData.width * scale, this.visData.height * scale);
            
            //offscreenCanvas.style.width = vis.width + 'px';
            //offscreenCanvas.style.height = vis.height + 'px';
            //offscreenCanvas.width = vis.width * scale;
            //offscreenCanvas.height = vis.height * scale;
            
            //offscreenCtx.scale(scale, scale);
        }
        
        //ctx.save();
        this.drawChildren(this.visData);
        //ctx.restore();
        //ctx.drawImage(offscreenCanvas, 0, 0);
        this.finishDrawingChildren();
    }
    
    private drawChildren(elData: any) {
        const ctx = this.ctx;
        
        //if(elData.type !== 'line')
        {
            ctx.save();
            this.applyTransform(elData.transform);
        }
        
        if(elData.type && elData.type !== 'g') {
            if(elData.type === 'title') {
                return;
            }
            let fill = elData.style.fill ? elData.style.fill : elData.fill;
            let stroke = elData.style.stroke ? elData.style.stroke : elData.stroke;
            let strokeWidth = elData.style['stroke-width'] ? elData.style['stroke-width'] : elData['stroke-width'];
            
            if(this.lastDrawn && this.lastDrawn.type !== elData.type) {
                if(this.lastDrawn.type === 'line') {
                    //let path = new Path2D(currentD);
                    ctx.closePath();
                    ctx.stroke();
                    ctx.restore(); //test
                    ctx.restore();
                } else if(this.lastDrawn.type === 'circle') {
                    ctx.fill();
                    ctx.stroke();
                    console.log('circle end kind of?!');
                }
                ctx.closePath();
            }
            
            if(elData.type === 'circle') {
                if(!this.queues.circles[fill]) {
                    this.queues.circles[fill] = [];
                }
                this.queues.circles[fill].push(elData);
            } else if(elData.type === 'line') {
                if(!this.lastDrawn || this.lastDrawn.type !== 'line') {
                    ctx.save();
                    this.applyTransform(elData.transform);
                    
                    ctx.beginPath();
                    ctx.strokeStyle = stroke;
                    ctx.lineWidth = strokeWidth;
                    //currentD = '';
                }
                
                //ctx.beginPath();
                ctx.moveTo(elData.x1, elData.y1);
                ctx.lineTo(elData.x2, elData.y2);
                //ctx.stroke();
                //currentD += 'M ' + elData.x1 +',' + elData.y1 + 'L ' + elData.x2 + ',' + elData.y2;
            } else if(elData.type === 'path') {
                let p = new Path2D(elData.d);
                //ctx.stroke(p);
                ctx.fillStyle = fill;
                //console.log(elData);
                ctx.fill(p);
                if(stroke !== 'none') {
                    ctx.strokeStyle = strokeWidth + ' ' + stroke;
                    ctx.stroke(p);
                }
            } else if(elData.type === 'tspan') {
                ctx.font = "10px Arial";
                ctx.fillStyle = "#000000";
                ctx.textAlign = elData.style.textAnchor === "middle" ? "center" : elData.style.textAnchor;
                ctx.fillText(elData.text, elData.x, elData.y);
            }
            this.lastDrawn = elData;
        }
        
        if(elData.children) {
            for(let i = 0; i < elData.children.length; i++) {
                this.drawChildren(elData.children[i]);
            }
        }
        if(elData.type !== 'line') {
            //console.log(elData.type);
            ctx.restore();
        }
    }
    
    private finishDrawingChildren() {
        //console.log('finishing children');
        //ctx.closePath();
        //ctx.fill();
        //ctx.stroke();
        
        for(let fill in this.queues.circles) {
            if(this.queues.circles.hasOwnProperty(fill)) {
                this.ctx.fillStyle = fill;
                let sampleData = (this.queues.circles as any)[fill][0];
                let stroke = sampleData.style.stroke ? sampleData.style.stroke : sampleData.stroke;
                this.ctx.lineWidth = sampleData.strokeWidth;
                this.ctx.strokeStyle = stroke;
                //console.log(queues.circles[fill][0].stroke);
                this.ctx.beginPath();
                for(let elData of (this.queues.circles as any)[fill]) {
                    this.ctx.moveTo(elData.cx + Math.round(elData.r), elData.cy);
                    this.ctx.arc(elData.cx, elData.cy, elData.r, 0, 2 * Math.PI);
                }
                this.ctx.fill();
                this.ctx.stroke();
            }
        }
    
        this.queues.circles = {};
        this.lastDrawn = null;
    }
    
    private captureD3On() {
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
            
            me.updateDataFromElementAttr(this, name, value);
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
    
    private updateDataFromElementAttr(element: Element, attrName: string, value: any) {
        try {
            let visNode = this.getVisNode(element);
            visNode[attrName] = value;
        } catch(e) {
            console.log(e);
            return;
        }
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
            return val ? Math.round(parseFloat(val)) : null;
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
                        "stroke-opacity": style.getPropertyValue('stroke-opacity'),
                        "stroke-width": style.getPropertyValue('stroke-width'),
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
    
    private propagateEvent(evt: MouseEvent): void {
        let new_event = new MouseEvent(evt.type, evt);
    
        this.svg.dispatchEvent(new_event); // for EasyPZ
    
        //console.log(vis, interactionSelections);
    
        for(let interactionSel of this.interactionSelections)
        {
            /*let selector = this.getElementSelector(interactionSel);
            let selectedNodes = [];
            let selectedNodeSelectors = [];*/
        
            //findMatchingChildren(vis, selector, 0, selectedNodes, selectedNodeSelectors);
            //const node = this.getVisNode(interactionSel);
        
            //for(let i = 0; i < selectedNodes.length; i++)
            {
                let parentSelector = this.getElementSelector(interactionSel);
                let parentNode = this.getVisNodeFromSelector(parentSelector);
                //let matchingVisParent = selectedNodes[i];
                let j = 1;
            
                for(let el of parentNode.children)
                {
                    if(this.nodeAtPosition(el, evt.clientX-10, evt.clientY-10))
                    {
                        let selector = parentSelector + ' > :nth-child(' + j + ')';
                        let svgEl = this.svg.querySelector(selector);
                        
                        if(svgEl) {
                            svgEl.dispatchEvent(new_event);
                        }
                        /*console.log(el, svgEl);
                        console.log(selector);
                        console.log(vis);
                        console.log(evt);*/
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
    
    private applyTransform(transformString: string) {
        const transform = transformString ? SvgToCanvas.parseTransform(transformString) : null;
        if(transform) {
            if(transform.rotate) {
                //console.log(transform.rotate);
            }
            //console.log(transform);
            this.ctx.transform(transform.scale, 0, 0, transform.scale, transform.translateX, transform.translateY);
            //ctx.rotate(transform.rotate / 2 / Math.PI);
            this.ctx.rotate(transform.rotate * Math.PI / 180);
        }
    }
    
    private static parseTransform(transform: string) {
        const transformObject = {translateX: 0, translateY: 0, scale: 1, rotate: 0, translateBeforeScale: false};
    
        if (transform) {
            transform = transform.replace(/ /g, '');
        
            //let translate  = /translate\((\d+),(\d+)\)/.exec(transform);
            const translate = /\s*translate\(([-0-9.]+),([-0-9.]+)\)/.exec(transform);
            if (translate) {
                transformObject.translateX = parseFloat(translate[1]);
                transformObject.translateY = parseFloat(translate[2]);
            }
            else {
                //console.error('no translate found', transform);
            }
        
            const scale = /\s*scale\(([-0-9.]+)\)/.exec(transform);
            if (scale) {
                transformObject.scale = parseFloat(scale[1]);
            }
            else {
                //console.error('no scale found', transform);
            }
        
            const rotate = /\s*rotate\(([-0-9.]+)\)/.exec(transform);
            if (rotate) {
                transformObject.rotate = parseFloat(rotate[1]);
            }
            else {
                //console.error('no rotate found', transform);
            }
        
            const translateScale = /\s*translate\(([-0-9.]+),([-0-9.]+)\)scale\(([-0-9.]+)\)/.exec(transform);
            if (translateScale) {
                transformObject.translateBeforeScale = true;
            }
        }
    
        return transformObject;
    }
}