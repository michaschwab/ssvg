import {VdomManager, VdomNode} from "../util/vdomManager";
import DrawingUtils from "./drawingUtils";
import SvgToCanvasWorker from "./canvasworker";

export default class Canvasrenderer implements SvgToCanvasWorker {
    
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
    
    private lastDrawn: VdomNode = null;
    private lastFullSecond = 0;
    private countSinceLastFullSecond = 0;
    
    draw() {
        const ctx = this.ctx;
        
        ctx.restore();
        ctx.save();
        
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, this.vdom.data.width, this.vdom.data.height);
    
        this.lastDrawn = null;
        this.drawNodeAndChildren(this.vdom.data);
        
        if(this.lastDrawn) {
            this.drawSingleNode(this.lastDrawn, 'end');
        }
        
        this.onDrawn();
    
        const fullSecond = Math.round(performance.now() / 1000);
        if(fullSecond !== this.lastFullSecond) {
            this.lastFullSecond = fullSecond;
            //console.log(this.countSinceLastFullSecond);
            this.countSinceLastFullSecond = 0;
        }
        this.countSinceLastFullSecond++;
    }
    
    private drawNodeAndChildren(elData: VdomNode) {
        const ctx = this.ctx;

        ctx.save();
        this.applyTransform(elData.transform);

        if(elData.transform) {
            this.forceSingle = true;
        }
        
        if(elData.type && elData.type !== 'g' && (!elData.style.display || elData.style.display !== 'none')) {
            if(elData.type === 'title') {
                return;
            }
            
            if(!this.forceSingle) {
                if(!this.lastDrawn || (this.lastDrawn && this.lastDrawn.type !== elData.type)) {
                    if(this.lastDrawn) {
                        this.drawSingleNode(this.lastDrawn, 'end');
                    }
                    this.drawSingleNode(elData, 'start');
                }
    
                this.drawSingleNode(elData);
            } else {
                this.drawSingleNode(elData, 'forcesingle');
            }
            
            this.lastDrawn = elData;
        }
        
        if(elData.children) {
            for(let i = 0; i < elData.children.length; i++) {
                this.drawNodeAndChildren(elData.children[i]);
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
            if(!fill) fill = '#000';
            const fillRgba = DrawingUtils.colorToRgba(fill, fillOpacity);
            if(!this.circlesByColor[fillRgba]) {
                this.circlesByColor[fillRgba] = [];
            }
            this.circlesByColor[fillRgba].push(elData);
        }
        if(mode === 'start') {
            this.circlesByColor = {};
            return;
        }
        if(mode === 'end') {
            for(let fillColor in this.circlesByColor) {
                if(this.circlesByColor.hasOwnProperty(fillColor)) {
                    this.ctx.fillStyle = fillColor;

                    let sampleData = this.circlesByColor[fillColor][0];
                    this.ctx.lineWidth = sampleData.style['stroke-width'] ?
                        parseFloat(sampleData.style['stroke-width']) : parseFloat(sampleData.strokeWidth);
                    this.ctx.strokeStyle = this.getStrokeStyle(elData);

                    this.ctx.beginPath();
                    for(let elData of this.circlesByColor[fillColor]) {
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
    
                    if(elData.style['stroke-rgba'] && elData.style['stroke-rgba'] !== 'none') {
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

    private getStrokeStyle(node: VdomNode) {
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
        }
        return node.style['stroke-rgba'];
    }
    
    private drawRect(elData: VdomNode) {
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

    private drawText(elData: VdomNode) {
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
        const x = elData.x || 0;
        const y = elData.y || 0;
        this.ctx.fillText(elData.text, x, y);
    }
    
    private drawPath(elData: VdomNode, mode: ('start'|'normal'|'end'|'forcesingle') = 'normal') {
        if(mode !== 'normal' && mode !== 'forcesingle') return;
        
        let fill = elData.style.fill ? elData.style.fill : elData.fill;
        if(!fill) fill = '#000';
        fill = DrawingUtils.colorToRgba(fill, elData.style['fill-opacity']);
        let stroke = this.getStrokeStyle(elData);
        let strokeWidth = elData.style['stroke-width'] ? elData.style['stroke-width'] : elData['stroke-width'];
    
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

        if(fill !== 'none') {
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

    private linesByColor: {[color: string]: VdomNode[]} = {};
    private drawLine(elData, mode: ('start'|'normal'|'end'|'forcesingle') = 'normal') {
        if(this.vdom.data.scale > 1) {
            //mode = 'forcesingle';
            // In my tests, drawing a long connected path is very slow for high DPI devices.
        }
        if(mode === 'normal') {
            const stroke = elData.style['stroke-rgba'];
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
                        parseFloat(sampleData.style['stroke-width']) : parseFloat(sampleData.strokeWidth);

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