import {VdomManager, VdomNode} from "../util/vdomManager";
import DrawingUtils from "./drawingUtils";
import CanvasWorker from "./canvasworker";

export default class Canvasrenderer implements CanvasWorker {
    
    private ctx: CanvasRenderingContext2D;
    
    constructor(private vdom: VdomManager, private canvas: HTMLCanvasElement,
                private forceSingle = false, private onDrawn = () => {}) {
        const ctx = canvas.getContext('2d');
        if(!ctx) throw new Error('could not create canvas context');
        
        this.ctx = ctx;
        this.ctx.scale(this.vdom.data.scale, this.vdom.data.scale);
        this.ctx.save();
        
        this.draw();
        
        setTimeout(() => {
            console.log(this.forceSingle, this.vdom.data);
            this.draw();
        }, 1000);
    }
    
    //private lastDrawn: VdomNode = null;
    private lastFullSecond = 0;
    private countSinceLastFullSecond = 0;
    
    draw() {
        const ctx = this.ctx;
        
        ctx.restore();
        ctx.save();
        
        //ctx.fillStyle = '#fff';
        //ctx.fillRect(0, 0, this.vdom.data.width, this.vdom.data.height);
        ctx.clearRect(0, 0, this.vdom.data.width, this.vdom.data.height);
    
        //this.lastDrawn = null;
        this.drawLine(null, 'start');
        this.drawCircle(null, 'start');
        this.drawRect(null, 'start');

        this.drawNodeAndChildren(this.vdom.data, this.forceSingle);

        this.drawLine(null, 'end');
        this.drawCircle(null, 'end');
        this.drawRect(null, 'end');

        
        this.onDrawn();
    
        const fullSecond = Math.round(performance.now() / 1000);
        if(fullSecond !== this.lastFullSecond) {
            this.lastFullSecond = fullSecond;
            //console.log(this.countSinceLastFullSecond);
            this.countSinceLastFullSecond = 0;
        }
        this.countSinceLastFullSecond++;
    }
    
    private drawNodeAndChildren(elData: VdomNode, forceSingle: boolean) {
        const ctx = this.ctx;

        ctx.save();
        this.applyTransform(elData.transform);

        if(elData.transform) {
            forceSingle = true;
        }
        
        if(elData.type && elData.type !== 'g' && (!elData.style.display || elData.style.display !== 'none')) {
            if(elData.type === 'title') {
                return;
            }
            
            if(!forceSingle) {
                /*if(!this.lastDrawn || (this.lastDrawn && this.lastDrawn.type !== elData.type)) {
                    if(this.lastDrawn) {
                        this.drawSingleNode(this.lastDrawn, 'end');
                    }
                    this.drawSingleNode(elData, 'start');
                }*/
    
                this.drawSingleNode(elData);
            } else {
                this.drawSingleNode(elData, 'forcesingle');
            }
            
            //this.lastDrawn = elData;
        }
        
        if(elData.children) {
            for(let i = 0; i < elData.children.length; i++) {
                this.drawNodeAndChildren(elData.children[i], forceSingle);
            }
        }
        //ctx.restore();
        ctx.restore();
    }
    
    private drawSingleNode(elData: VdomNode, mode: ('start'|'normal'|'end'|'forcesingle') = 'normal') {
        const type: string = elData.type;
        const drawFct = this['draw' + type.substr(0,1).toUpperCase() + type.substr(1)];
        if(!drawFct) {
            return console.error('no draw function yet for ', type);
        }
        drawFct.call(this, elData, mode);
    }

    private drawClippath(elData: VdomNode) {
        console.warn('clippaths can not be rendered yet.')
    }
    
    private circlesByColor: {[color: string]: VdomNode[]} = {};
    private drawCircle(elData: VdomNode, mode: ('start'|'normal'|'end'|'forcesingle') = 'normal') {
        if(mode === 'normal') {
            let fill = elData.style.fill ? elData.style.fill : elData.fill;
            let fillOpacity = elData.style['fill-opacity'] ? elData.style['fill-opacity'] : elData.style['opacity'];
            if(!fill) fill = 'rgb(0,0,0)';
            const fillRgba = DrawingUtils.colorToRgba(fill, fillOpacity);
            const stroke = this.getStrokeStyle(elData);
            const handle = fillRgba + ';' + stroke;
            if(!this.circlesByColor[handle]) {
                this.circlesByColor[handle] = [];
            }
            this.circlesByColor[handle].push(elData);
        }
        if(mode === 'start') {
            this.circlesByColor = {};
            return;
        }
        if(mode === 'end') {
            for(let fillAndStrokeColor in this.circlesByColor) {
                if(this.circlesByColor.hasOwnProperty(fillAndStrokeColor)) {
                    const split = fillAndStrokeColor.split(';');
                    const fillColor = split[0];
                    const strokeColor = split[1];

                    this.ctx.fillStyle = fillColor;
                    let sampleData = this.circlesByColor[fillAndStrokeColor][0];
                    this.ctx.lineWidth = sampleData.style['stroke-width'] ?
                        parseFloat(sampleData.style['stroke-width']) : parseFloat(sampleData.strokeWidth);
                    this.ctx.strokeStyle = strokeColor;

                    this.ctx.beginPath();
                    for(let elData of this.circlesByColor[fillAndStrokeColor]) {
                        const cx = elData.cx ? elData.cx : 0;
                        const cy = elData.cy ? elData.cy : 0;
                        const r = elData.r;
                        this.ctx.save();
                        this.applyTransform(elData.transform);
                        this.ctx.moveTo(cx + r, cy);
                        this.ctx.arc(cx, cy, r, 0, 2 * Math.PI);
                        this.ctx.restore();
                        //this.ctx.restore();
                    }

                    if(fillColor !== 'none'){
                        this.ctx.fill();
                    }

                    if(sampleData.style['stroke-rgba'] && sampleData.style['stroke-rgba'] !== 'none') {
                        this.ctx.stroke();
                    }
                }
            }
            return;
        }
        if(mode === 'forcesingle') {
            let fill = elData.style.fill ? elData.style.fill : elData.fill;
            if(!fill) fill = '#000';
            let fillOpacity = elData.style['fill-opacity'] ? elData.style['fill-opacity'] : elData.style['opacity'];

            const cx = elData.cx || 0;
            const cy = elData.cy || 0;

            this.ctx.beginPath();
            this.ctx.fillStyle = DrawingUtils.colorToRgba(fill, fillOpacity);
            this.ctx.strokeStyle = this.getStrokeStyle(elData);
            this.ctx.lineWidth = elData.style['stroke-width'] ?
                parseFloat(elData.style['stroke-width']) : parseFloat(elData.strokeWidth);
            this.ctx.arc(cx, cy, elData.r, 0, 2 * Math.PI);
            if(fill !== 'none'){
                this.ctx.fill();
            }

            if(elData.style['stroke-rgba'] && elData.style['stroke-rgba'] !== 'none') {
                this.ctx.stroke();
            }
        }
    }

    private getFillStyle(node: VdomNode): string {
        let fill = node.style.fill ? node.style.fill : node.fill;
        let opacity = node.style['fill-opacity'] ? node.style['fill-opacity'] : node.style['opacity'];
        fill = DrawingUtils.colorToRgba(fill, opacity);
        return fill;
    }

    private getStrokeStyle(node: VdomNode): string {
        if(node.style['stroke-rgba']) {
            return node.style['stroke-rgba'];
        }
        let stroke = node.style.stroke ? node.style.stroke : node.stroke;
        if(stroke) {
            let strokeOpacity = node.style['stroke-opacity'] === undefined ? node.style['opacity']
                : node.style['stroke-opacity'];
            if(strokeOpacity === undefined) {
                strokeOpacity = node['stroke-opacity'] === undefined ? node['opacity'] : node['stroke-opacity'];
            }

            node.style['stroke-rgba'] = DrawingUtils.colorToRgba(stroke, strokeOpacity);
            return node.style['stroke-rgba'];
        }
        return 'none';
    }

    private rectsByColor = {};

    private drawRect(elData: VdomNode, mode: ('start'|'normal'|'end'|'forcesingle') = 'normal') {

        if(mode === 'normal') {
            let fill = elData.style.fill ? elData.style.fill : elData.fill;
            let fillOpacity = elData['fill-opacity'] ? elData['fill-opacity'] : elData['opacity'];
            let fillOpacityStyle = elData.style['fill-opacity'] ? elData.style['fill-opacity'] : elData.style['opacity'];

            if(fillOpacityStyle !== undefined) {
                fillOpacity = fillOpacityStyle;
            }

            //if(!fill) fill = '#000';
            const fillRgba = DrawingUtils.colorToRgba(fill, fillOpacity);
            if(!this.rectsByColor[fillRgba]) {
                this.rectsByColor[fillRgba] = [];
            }
            this.rectsByColor[fillRgba].push(elData);
        }
        if(mode === 'start') {
            this.rectsByColor = {};
            return;
        }
        if(mode === 'end') {
            for(let fillColor in this.rectsByColor) {
                if(this.rectsByColor.hasOwnProperty(fillColor)) {
                    this.ctx.fillStyle = fillColor;

                    let sampleData = this.rectsByColor[fillColor][0];
                    this.ctx.lineWidth = sampleData.style['stroke-width'] ?
                        parseFloat(sampleData.style['stroke-width']) : parseFloat(sampleData.strokeWidth);
                    this.ctx.strokeStyle = this.getStrokeStyle(sampleData);

                    this.ctx.beginPath();
                    for(let elData of this.rectsByColor[fillColor]) {
                        const cx = elData.cx ? elData.cx : 0;
                        const cy = elData.cy ? elData.cy : 0;
                        const r = elData.r;
                        this.ctx.save();
                        this.applyTransform(elData.transform);
                        this.ctx.moveTo(cx + r, cy);
                        this.ctx.rect(elData.x, elData.y, elData.width, elData.height);
                        this.ctx.restore();
                        //this.ctx.restore();
                    }
                    if(fillColor !== 'none'){
                        this.ctx.fill();
                    }

                    if(sampleData.style['stroke-rgba'] && sampleData.style['stroke-rgba'] !== 'none') {
                        this.ctx.stroke();
                    }
                }
            }
            return;
        }
        if(mode === 'forcesingle') {
            let fill = elData.style.fill ? elData.style.fill : elData.fill;
            if(fill) {
                fill = DrawingUtils.colorToRgba(fill, elData.style['fill-opacity']);
            }

            if(fill && fill !== 'none') {
                this.ctx.fillStyle = elData.style.fill ? elData.style.fill : elData.fill;
                this.ctx.fillRect(elData.x, elData.y, elData.width, elData.height);
            }

            let stroke = elData.style.stroke ? elData.style.stroke : elData.stroke;
            if(stroke) {
                stroke = DrawingUtils.colorToRgba(stroke, elData.style['stroke-opacity']);
                this.ctx.strokeStyle = stroke;
                this.ctx.beginPath();
                this.ctx.rect(elData.x, elData.y, elData.width, elData.height);
                this.ctx.stroke();
            }
        }
    }

    private drawText(elData: VdomNode) {
        if(elData.text === '') {
            return;
        }
        const fontFamily = 'Arial';
        const fontSize = elData['font-size'] ? elData['font-size'] + 'px' : '30px';
        let font = elData.style['font'] ? elData.style['font'] : elData['font'];
        if(!font) {
            font = fontSize + ' ' + fontFamily;
        }
        if(elData['text-anchor']) {
            const align = elData['text-anchor'] === 'middle' ? 'center' : elData['text-anchor'];
            this.ctx.textAlign = align;
        }
        let fill = elData['fill'] ? elData['fill'] : elData.style['fill'];
        if(!fill) fill = '#000';
        this.ctx.font = font;
        this.ctx.fillStyle = fill;
        let x = elData.x || 0;
        let y = elData.y || 0;
        let dx = elData.dx || 0;
        let dy = elData.dy || 0;
        this.ctx.fillText(elData.text, x + dx, y + dy);
    }

    private drawPath(elData: VdomNode, mode: ('start'|'normal'|'end'|'forcesingle') = 'normal') {
        if(mode !== 'normal' && mode !== 'forcesingle') return;

        const fill = this.getFillStyle(elData);
        const stroke = this.getStrokeStyle(elData);
        const strokeWidth = elData.style['stroke-width'] ? elData.style['stroke-width'] : elData['stroke-width'];

        let p = new Path2D(elData.d);
        this.ctx.fillStyle = fill;
        if(stroke && stroke !== 'none') {
            if(strokeWidth) {
                this.ctx.lineWidth = strokeWidth;
                this.ctx.strokeStyle = stroke;
            } else {
                this.ctx.strokeStyle = stroke;
            }
            this.ctx.stroke(p);
        }

        if(fill && fill !== 'none') {
            this.ctx.fill(p);
        }
    }
    
    private drawTspan(elData: VdomNode, mode: ('start'|'normal'|'end'|'forcesingle') = 'normal') {
        if(mode !== 'normal' && mode !== 'forcesingle') return;
        
        this.ctx.font = "10px Arial";
        this.ctx.fillStyle = "#000000";
        const textAlign = <CanvasTextAlign> (elData.style.textAnchor === "middle" ? "center" : elData.style.textAnchor);
        this.ctx.textAlign = textAlign;
        this.ctx.fillText(elData.text, elData.x, elData.y);
    }

    private drawTextpath(elData: VdomNode) {
        console.warn('no draw function yet for textpath');
    }

    private linesByColor: {[color: string]: VdomNode[]} = {};
    private drawLine(elData, mode: ('start'|'normal'|'end'|'forcesingle') = 'normal') {
        if(this.vdom.data.scale > 1) {
            //mode = 'forcesingle';
            // In my tests, drawing a long connected path is very slow for high DPI devices.
        }
        if(mode === 'normal') {
            const stroke = this.getStrokeStyle(elData);
            if(stroke === 'none') {
                return;
            }
            if(!this.linesByColor[stroke]) {
                this.linesByColor[stroke] = [];
            }
            this.linesByColor[stroke].push(elData);
        }
        if(mode === 'start') {
            this.linesByColor = {};
            return;
        }
        if(mode === 'end') {
            for(let strokeColor in this.linesByColor) {
                if(this.linesByColor.hasOwnProperty(strokeColor)) {
                    this.ctx.strokeStyle = strokeColor;

                    let sampleData = this.linesByColor[strokeColor][0];
                    this.ctx.lineWidth = sampleData.style['stroke-width'] ?
                        parseFloat(sampleData.style['stroke-width']) : parseFloat(sampleData['stroke-width']);

                    this.ctx.beginPath();
                    for(let elData of this.linesByColor[strokeColor]) {
                        this.ctx.save();
                        this.applyTransform(elData.transform);
                        this.ctx.moveTo(elData.x1, elData.y1);
                        this.ctx.lineTo(elData.x2, elData.y2);
                        this.ctx.restore();
                        //this.ctx.restore();
                    }

                    this.ctx.stroke();
                }
            }
            return;
        }
        if(mode === 'forcesingle') {
            this.ctx.beginPath();
            this.ctx.moveTo(elData.x1, elData.y1);
            this.ctx.lineTo(elData.x2, elData.y2);

            this.ctx.strokeStyle = elData.style['stroke-rgba'];
            //safeLog(stroke, this.ctx.strokeStyle);
            this.ctx.stroke();
        }
    }

    private drawDefs(node: VdomNode) {
        //TODO figure out.
    }

    private drawMarker(node: VdomNode) {
        //TODO figure out.
    }
    
    private applyTransform(transformString: string) {
        const transform = transformString ? DrawingUtils.parseTransform(transformString) : null;
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