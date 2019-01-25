import VDom from "../util/vdom";
import CanvasWorkerMessage from "../util/canvas-worker-message"
import Canvasrenderer from "./canvasrenderer";
//import Webglrenderer from "./webglrenderer";

export default interface SvgToCanvasWorker {
    draw(): void;
}

let worker: SvgToCanvasWorker;
let vdom: VDom;

self.onmessage = function(e: MessageEvent) {
    
    const msg: CanvasWorkerMessage = e.data;
    
    if(msg && msg.cmd) {
        switch(msg.cmd) {
            case 'INIT':
                //console.log('init');
                vdom = new VDom(msg.data.visData);
                worker = new Canvasrenderer(vdom, msg.data.canvas);
                //worker = new Webglrenderer(vdom, msg.data.canvas);
                break;
            case 'UPDATE_NODES':
                //console.log('UPDATE', data.queue, data.parentNodeSelectors);
                vdom.updatePropertiesFromQueue(msg.data.queue);
                worker.draw();
                break;
            case 'ADD_NODE':
                //console.log('ADD', data.node, data.parentNodeSelector);
                vdom.addNode(msg.data.node, msg.data.parentNodeSelector);
                break;
            default:
                console.error('did not find command ', msg.cmd);
        }
    }
};
