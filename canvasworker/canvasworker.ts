import { VdomManager } from "../util/vdom/vdom-manager";
import {CanvasWorkerMessage, CanvasUpdateWorkerMessage} from "../util/canvas-worker-message"
import Canvasrenderer from "./canvasrenderer";

export default interface CanvasWorker {
    draw(): void;
    addNode?(node: any): void;
    updatePropertiesFromQueue?(queue: any): void;
}

let worker: CanvasWorker;
const workerContext: Worker = self as any;
let vdom: VdomManager;

workerContext.onmessage = function(e: MessageEvent) {
    
    const msg: CanvasWorkerMessage = e.data;
    
    if(msg && msg.cmd) {
        switch(msg.cmd) {
            case 'INIT':
                //console.log('init');
                vdom = new VdomManager(msg.data.visData, false);
                const safeMode = !!msg.data.safeMode;
                worker = new Canvasrenderer(vdom, msg.data.canvas, safeMode, () => {
                    workerContext.postMessage({msg: 'DRAWN'});
                });
                /*worker = new Twojsrenderer(vdom, msg.data.canvas, msg.data.offscreenCanvas, () => {
                    postMessage({msg: 'DRAWN'});
                });*/
                /*worker = new Webglrenderer(vdom, msg.data.canvas, () => {
                    postMessage({msg: 'DRAWN'});
                });*/
                break;
            case 'UPDATE_NODES':
                const data = msg as CanvasUpdateWorkerMessage;
                //console.log('UPDATE', msg.data.queue, msg.data.parentNodeSelectors);

                for(let operation of data.data.enterExit) {
                    if(operation.cmd === 'ENTER') {
                        if(!operation.keepChildren) {
                            operation.node.children = [];
                        }
                        vdom.addNode(operation.node);
                        vdom.addNodeToParent(operation.node, operation.parentNodeIndex);
                        if(worker.addNode) {
                            worker.addNode(operation.node);
                        }
                    } else if(operation.cmd === 'EXIT') {
                        vdom.removeNode(operation.childIndex, operation.parentGlobalIndex);
                    }
                }

                if(worker.updatePropertiesFromQueue) {
                    worker.updatePropertiesFromQueue(data.data.update);
                } else {
                    vdom.updatePropertiesFromQueue(data.data.update);
                }

                worker.draw();
                break;
            default:
                console.error('did not find command ', msg.cmd);
        }
    }
};
