import VDom from "../util/vdom";
import DrawingUtils from "./drawingUtils";
import SvgToCanvasWorker from "./canvasworker";

export default class Canvasrenderer implements SvgToCanvasWorker {
    
    private ctx: CanvasRenderingContext2D;
    
    constructor(private vdom: VDom, private canvas: HTMLCanvasElement) {
        const ctx = canvas.getContext('2d');
        if(!ctx) throw new Error('could not create canvas context');
        
        this.ctx = ctx;
        this.ctx.scale(this.vdom.data.scale, this.vdom.data.scale);
        console.log(this.vdom.data.scale);
        this.ctx.save();
        
        this.draw();
        
        setTimeout(() => {
            console.log(this.vdom.data);
        }, 1000);
    }
    
    private lastDrawn: any = null;
    
    draw() {
        const ctx = this.ctx;
        
        ctx.restore();
        ctx.save();
        
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, this.vdom.data.width, this.vdom.data.height);
        
        this.drawChildren(this.vdom.data);
        
        postMessage({msg: 'DRAWN'});
    }
    
    private drawChildren(elData: any) {
        const ctx = this.ctx;
        
        ctx.save();
        this.applyTransform(elData.transform);
        
        if(elData.type && elData.type !== 'g') {
            if(elData.type === 'title') {
                return;
            }
            
            if(elData.type === 'circle') {
                this.drawCircle(elData);
            } else if(elData.type === 'line') {
                this.drawLine(elData);
            } else if(elData.type === 'path') {
                this.drawPath(elData);
            } else if(elData.type === 'tspan') {
                this.drawTspan(elData);
            }
            this.lastDrawn = elData;
        }
        
        if(elData.children) {
            for(let i = 0; i < elData.children.length; i++) {
                this.drawChildren(elData.children[i]);
            }
        }
        if(elData.type !== 'line') {
        
        }
    }
    
    private drawCircle(elData) {
        let fill = elData.style.fill ? elData.style.fill : elData.fill;
        if(!fill) fill = '#000';
        let stroke = elData.style.stroke ? elData.style.stroke : elData.stroke;
        
        this.ctx.beginPath();
        this.ctx.fillStyle = DrawingUtils.colorToRgba(fill, elData.style['fill-opacity']);
        this.ctx.strokeStyle = stroke;
        this.ctx.arc(elData.cx, elData.cy, elData.r, 0, 2 * Math.PI);
        this.ctx.fill();
        if(stroke) {
            this.ctx.stroke();
        }
    }
    
    private drawPath(elData) {
        let fill = elData.style.fill ? elData.style.fill : elData.fill;
        let stroke = elData.style.stroke ? elData.style.stroke : elData.stroke;
        let strokeWidth = elData.style['stroke-width'] ? elData.style['stroke-width'] : elData['stroke-width'];
    
        let p = new Path2D(elData.d);
        this.ctx.fillStyle = fill;
        if(stroke !== 'none') {
            this.ctx.lineWidth = strokeWidth;
            this.ctx.strokeStyle = strokeWidth + ' ' + stroke;
            this.ctx.stroke(p);
        }
    }
    
    private drawTspan(elData) {
        this.ctx.font = "10px Arial";
        this.ctx.fillStyle = "#000000";
        this.ctx.textAlign = elData.style.textAnchor === "middle" ? "center" : elData.style.textAnchor;
        this.ctx.fillText(elData.text, elData.x, elData.y);
    }
    
    private drawLine(elData) {
        let stroke = elData.style.stroke ? elData.style.stroke : elData.stroke;
        
        this.ctx.beginPath();
        this.ctx.strokeStyle = stroke;
        this.ctx.moveTo(elData.x1, elData.y1);
        this.ctx.lineTo(elData.x2, elData.y2);
        this.ctx.stroke();
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