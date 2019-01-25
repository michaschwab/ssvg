import VDom from "../util/vdom";
import DrawingUtils from "./drawingUtils";
import SvgToCanvasWorker from "./canvasworker";

export default class Canvasrenderer implements SvgToCanvasWorker {
    
    private ctx: CanvasRenderingContext2D;
    private queues: { circles: any } = {
        circles: {}
    };
    
    constructor(private vdom: VDom, private canvas: HTMLCanvasElement) {
        const ctx = canvas.getContext('2d');
        if(!ctx) throw new Error('could not create canvas context');
        
        this.ctx = ctx;
        this.ctx.scale(this.vdom.data.scale, this.vdom.data.scale);
        
        this.draw();
        
        setTimeout(() => {
            console.log(this.vdom.data);
        }, 1000);
    }
    
    private lastDrawn: any = null;
    
    draw() {
        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        let scale = this.vdom.data.scale;
        
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, this.vdom.data.width * scale, this.vdom.data.height * scale);
        
        //this.executeSetAttributeQueue();
        //ctx.save();
        //console.log(this.visData);
        this.drawChildren(this.vdom.data);
        //ctx.restore();
        //ctx.drawImage(offscreenCanvas, 0, 0);
        this.finishDrawingChildren();
        
        postMessage({msg: 'DRAWN'});
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
                    /*ctx.fill();
                    ctx.stroke();
                    console.log('circle end kind of?!');*/
                }
                ctx.closePath();
            }
            
            if(elData.type === 'circle') {
                if(!fill) fill = '#000';
                /*if(!this.queues.circles[fill]) {
                    this.queues.circles[fill] = [];
                }
                this.queues.circles[fill].push(elData);*/
                
                ctx.beginPath();
                ctx.fillStyle = DrawingUtils.colorToRgba(fill, elData.style['fill-opacity']);
                ctx.strokeStyle = stroke;
                ctx.arc(elData.cx, elData.cy, elData.r, 0, 2 * Math.PI);
                ctx.fill();
                if(stroke) {
                    ctx.stroke();
                }
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
                
                if(stroke) {
                    this.ctx.stroke();
                }
            }
        }
        
        this.queues.circles = {};
        this.lastDrawn = null;
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