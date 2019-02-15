import VDom from "../util/vdom";
import DrawingUtils from "./drawingUtils";
import SvgToCanvasWorker from "./canvasworker";

export default class Canvasrenderer implements SvgToCanvasWorker {
    
    private ctx: CanvasRenderingContext2D;
    
    constructor(private vdom: VDom, private canvas: HTMLCanvasElement,
                private forceSingle = false, private onDrawn = () => {}) {
        const ctx = canvas.getContext('2d');
        if(!ctx) throw new Error('could not create canvas context');
        
        this.ctx = ctx;
        this.ctx.scale(this.vdom.data.scale, this.vdom.data.scale);
        this.ctx.save();
        
        this.draw();
        
        setTimeout(() => {
            console.log(this.vdom.data);
            this.draw();
        }, 1000);
    }
    
    private lastDrawn: any = null;
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
    
    private drawNodeAndChildren(elData: any) {
        const ctx = this.ctx;

        ctx.save();
        this.applyTransform(elData.transform);
        
        if(elData.type && elData.type !== 'g') {
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
    
    private drawSingleNode(elData: any, mode: ('start'|'normal'|'end'|'forcesingle') = 'normal') {
        const type: string = elData.type;
        this['draw' + type.substr(0,1).toUpperCase() + type.substr(1)](elData, mode);
    }
    
    private circlesByColor: {[color: string]: any} = {};
    private drawCircle(elData, mode: ('start'|'normal'|'end'|'forcesingle') = 'normal') {
        if(mode === 'normal') {
            let fill = elData.style.fill ? elData.style.fill : elData.fill;
            if(!fill) fill = '#000';
            const fillRgba = DrawingUtils.colorToRgba(fill, elData.style['fill-opacity']);
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
            //safeLog(this.circlesByColor);
            for(let fillColor in this.circlesByColor) {
                if(this.circlesByColor.hasOwnProperty(fillColor)) {
                    this.ctx.fillStyle = fillColor;
    
                    let sampleData = this.circlesByColor[fillColor][0];
                    let stroke = sampleData.style.stroke ? sampleData.style.stroke : elData.stroke;
                    if(stroke) {
                        stroke = DrawingUtils.colorToRgba(stroke, sampleData.style['stroke-opacity']);
                    }
                    this.ctx.lineWidth = sampleData.style['stroke-width'] ?
                        parseFloat(sampleData.style['stroke-width']) : sampleData.strokeWidth;
                    this.ctx.strokeStyle = stroke;
                    let fill = sampleData.style.fill ? sampleData.style.fill : sampleData.fill;
                    if(!fill) fill = '#000';
                    
                    this.ctx.beginPath();
                    for(let elData of this.circlesByColor[fillColor]) {
                        const cx = elData.cx || 0;
                        const cy = elData.cy || 0;
                        this.ctx.save();
                        this.applyTransform(elData.transform);
                        this.ctx.moveTo(cx + elData.r, cy);
                        this.ctx.arc(cx, cy, elData.r, 0, 2 * Math.PI);
                        this.ctx.restore();
                        this.ctx.restore();
                    }
                    if(fill !== 'none'){
                        this.ctx.fill();
                    }
    
                    if(stroke) {
                        this.ctx.stroke();
                    }
                }
            }
            return;
        }
        if(mode === 'forcesingle') {
            let fill = elData.style.fill ? elData.style.fill : elData.fill;
            if(!fill) fill = '#000';
            let stroke = elData.style.stroke ? elData.style.stroke : elData.stroke;
            if(stroke) {
                stroke = DrawingUtils.colorToRgba(stroke, elData.style['stroke-opacity']);
            }

            const cx = elData.cx || 0;
            const cy = elData.cy || 0;

            this.ctx.beginPath();
            this.ctx.fillStyle = DrawingUtils.colorToRgba(fill, elData.style['fill-opacity']);
            this.ctx.strokeStyle = stroke;
            this.ctx.lineWidth = elData.style['stroke-width'] ?
                parseFloat(elData.style['stroke-width']) : elData.strokeWidth;
            this.ctx.arc(cx, cy, elData.r, 0, 2 * Math.PI);
            if(fill !== 'none'){
                this.ctx.fill();
            }

            if(stroke) {
                this.ctx.stroke();
            }
        }
    }
    
    private drawRect(elData) {
        this.ctx.fillStyle = elData.style.fill ? elData.style.fill : elData.fill;
        this.ctx.fillRect(elData.x, elData.y, elData.width, elData.height);
    }
    
    private drawPath(elData, mode: ('start'|'normal'|'end'|'forcesingle') = 'normal') {
        if(mode !== 'normal' && mode !== 'forcesingle') return;
        
        let fill = elData.style.fill ? elData.style.fill : elData.fill;
        let stroke = elData.style.stroke ? elData.style.stroke : elData.stroke;
        let strokeWidth = elData.style['stroke-width'] ? elData.style['stroke-width'] : elData['stroke-width'];
    
        let p = new Path2D(elData.d);
        this.ctx.fillStyle = fill;
        if(stroke !== 'none') {
            if(strokeWidth) {
                this.ctx.lineWidth = strokeWidth;
                this.ctx.strokeStyle = strokeWidth + ' ' + stroke;
            } else {
                this.ctx.strokeStyle = stroke;
            }
            this.ctx.stroke(p);
        }
    }
    
    private drawTspan(elData, mode: ('start'|'normal'|'end'|'forcesingle') = 'normal') {
        if(mode !== 'normal' && mode !== 'forcesingle') return;
        
        this.ctx.font = "10px Arial";
        this.ctx.fillStyle = "#000000";
        this.ctx.textAlign = elData.style.textAnchor === "middle" ? "center" : elData.style.textAnchor;
        this.ctx.fillText(elData.text, elData.x, elData.y);
    }
    
    private drawLine(elData, mode: ('start'|'normal'|'end'|'forcesingle') = 'normal') {
        if(this.vdom.data.scale > 1) {
            mode = 'forcesingle';
            // In my tests, drawing a long connected path is very slow for high DPI devices.
        }
        if(mode === 'normal') {
            this.ctx.moveTo(elData.x1, elData.y1);
            this.ctx.lineTo(elData.x2, elData.y2);
        }
        if(mode === 'start') {
            this.ctx.beginPath();
            return;
        }
        if(mode === 'end') {
            this.ctx.strokeStyle = elData.style.stroke ? elData.style.stroke : elData.stroke;
            this.ctx.stroke();
            return;
        }
        if(mode === 'forcesingle') {
            this.ctx.beginPath();
            this.ctx.moveTo(elData.x1, elData.y1);
            this.ctx.lineTo(elData.x2, elData.y2);
            this.ctx.strokeStyle = elData.style.stroke ? elData.style.stroke : elData.stroke;
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