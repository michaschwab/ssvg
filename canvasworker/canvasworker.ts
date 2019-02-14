import VDom from "../util/vdom";
import CanvasWorkerMessage from "../util/canvas-worker-message"
import Canvasrenderer from "./canvasrenderer";
import Webglrenderer from "./webglrenderer";
import Twojsrenderer from "./twojsrenderer";

export default interface SvgToCanvasWorker {
    draw(): void;
    addNode?(node: any): void;
    updatePropertiesFromQueue?(queue: any): void;
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
                const safeMode = !!msg.data.safeMode;
                worker = new Canvasrenderer(vdom, msg.data.canvas, safeMode, () => {
                    postMessage({msg: 'DRAWN'});
                });
                /*worker = new Twojsrenderer(vdom, msg.data.canvas, msg.data.offscreenCanvas, () => {
                    postMessage({msg: 'DRAWN'});
                });*/
                /*worker = new Webglrenderer(vdom, msg.data.canvas, () => {
                    postMessage({msg: 'DRAWN'});
                });*/
                break;
            case 'UPDATE_NODES':
                //console.log('UPDATE', msg.data.queue, msg.data.parentNodeSelectors);
                if(worker.updatePropertiesFromQueue) {
                    worker.updatePropertiesFromQueue(msg.data.queue);
                } else {
                    vdom.updatePropertiesFromQueue(msg.data.queue);
                }
                worker.draw();
                break;
            case 'ADD_NODE':
                //console.log('ADD', data.node, data.parentNodeSelector);
                const node = vdom.addNode(msg.data.node, msg.data.parentNodeSelector);
                if(worker.addNode) {
                    worker.addNode(node);
                }
                break;
            default:
                console.error('did not find command ', msg.cmd);
        }
    }
};
