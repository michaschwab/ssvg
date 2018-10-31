//export = 0;

let worker: SvgToCanvasWorker;
self.onmessage = function(e) {
    if(e.data && e.data.cmd) {
        const data = e.data.data;
        //console.log(e.data.cmd);
        switch(e.data.cmd) {
            case 'INIT':
                worker = new SvgToCanvasWorker(data.visData, data.canvas);
                break;
            case 'UPDATE_NODES':
                //console.log('UPDATE', data.queue, data.parentNodeSelectors);
                worker.updatePropertiesFromQueue(data.queue, data.parentNodeSelectors);
                //worker.drawCanvas();
                break;
            case 'ADD_NODE':
                //console.log('ADD', data.node, data.parentNodeSelector);
                worker.addNode(data.node, data.parentNodeSelector);
                break;
            default:
                console.error('did not find command ', e.data.cmd);
        }
    }
};

class SvgToCanvasWorker {
    /*private visData: any= {
        width: 0,
        height: 0,
        scale: 1,
        children: []
    };*/
    private ctx: CanvasRenderingContext2D;
    private queues: { circles: any } = {
        circles: {}
    };
    private setSize = false;
    
    constructor(private visData: any, private canvas: HTMLCanvasElement) {
        //console.log(canvas);
    
        const ctx = canvas.getContext('2d');
        if(!ctx) throw new Error('could not create canvas context');
    
        this.ctx = ctx;
        this.ctx.scale(this.visData.scale, this.visData.scale);
        
        const raf = () => {
            this.drawCanvas();
            requestAnimationFrame(raf);
        };
        requestAnimationFrame(raf);
        
        setTimeout(() => {
            console.log(this.visData);
        }, 1000);
    }
    
    private lastDrawn: any = null;
    
    drawCanvas() {
        const canvas = this.canvas;
        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        let scale = this.visData.scale;
        
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, this.visData.width * scale, this.visData.height * scale);
        
        //this.executeSetAttributeQueue();
        //ctx.save();
        //console.log(this.visData);
        this.drawChildren(this.visData);
        //ctx.restore();
        //ctx.drawImage(offscreenCanvas, 0, 0);
        this.finishDrawingChildren();
    }
    
    addNode(nodeData: any, parentNodeSelector: string) {
        let parentNode = this.getVisNodeFromSelector(parentNodeSelector);
        if(!parentNode) {
            if(parentNodeSelector === "") {
                parentNode = this.visData;
            } else {
                console.error(parentNode, parentNodeSelector);
            }
        }
        
        parentNode.children.push(nodeData);
        
        //console.log(this.visData);
    }
    
    updatePropertiesFromQueue(setAttrQueue: any, setAttrParentSelectors: any) {
        for(let parentIndex in setAttrQueue) {
            if(setAttrQueue.hasOwnProperty(parentIndex)) {
                const pIndex = parseInt(parentIndex);
                let parentNodeSelector = setAttrParentSelectors[pIndex];
                let parentNode = this.getVisNodeFromSelector(parentNodeSelector);
                if(!parentNode) {
                    console.error(parentNode, pIndex, parentIndex);
                }
    
                for(let attrName in setAttrQueue[parentIndex]) {
                    if(setAttrQueue[parentIndex].hasOwnProperty(attrName)) {
                        for(let childIndex in setAttrQueue[parentIndex][attrName]) {
                            const childNode = parentNode.children[childIndex];
                            //console.log(parentNode, childIndex);
                            childNode[attrName] = setAttrQueue[parentIndex][attrName][childIndex];
                        }
                    }
                }
            }
        }
    }
    private count = 0;
    private drawChildren(elData: any) {
        const ctx = this.ctx;
        
        this.count++;
        if(this.count < 4) {
            //console.log(this.visData);
        }
        
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
                    //ctx.lineWidth = strokeWidth;
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
                //ctx.fill(p);
                if(stroke !== 'none') {
                    ctx.lineWidth = strokeWidth;
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
    
    private applyTransform(transformString: string) {
        const transform = transformString ? SvgToCanvasWorker.parseTransform(transformString) : null;
        if(transform) {
            
            if(transform.rotate) {
                //console.log(transform.rotate);
            }
            //console.log(transformString);
            this.ctx.transform(transform.scaleX, 0, 0, transform.scaleY, transform.translateX, transform.translateY);
            //ctx.rotate(transform.rotate / 2 / Math.PI);
            this.ctx.rotate(transform.rotate * Math.PI / 180);
            //console.log(transform.rotate);
        }
    }
    
    private static parseTransform(transform: string) {
        const transformObject = {translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0, translateBeforeScale: false};
        
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
                transformObject.scaleX = parseFloat(scale[1]);
                transformObject.scaleY = parseFloat(scale[1]);
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
            
            const matrix = /\s*matrix\(([-0-9.]+),([-0-9.]+),([-0-9.]+),([-0-9.]+),([-0-9.]+),([-0-9.]+)\)/.exec(transform);
            if(matrix) {
                transformObject.scaleX = parseFloat(matrix[1]);
                // 2 is horizontal skewing
                // 3 is vertical skewing
                transformObject.scaleY = parseFloat(matrix[4]);
                transformObject.translateX = parseFloat(matrix[5]);
                transformObject.translateY = parseFloat(matrix[6]);
            }
        }
        
        return transformObject;
    }
    
}