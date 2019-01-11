import CanvasForceWorkerMessage from "../util/forceworkermessage";

export default class Forcefrontend {

    private worker: Worker = new Worker('dist/forceworker.js');
    private onTick: () => void;
    
    private nodes;
    private links;
    
    private nodesById: {[id: string]: any} = {};
    
    constructor() {
        if((window as any)['d3']) {
            this.replaceD3ForceSimulation();
            this.replaceD3Attr();
            this.setupWorkerCommunication()
        }
    }

    replaceD3ForceSimulation() {
        const d3 = (window as any)['d3'];

        d3.forceSimulation = () => {
            const sim = {
                force: () => { return sim; },
                nodes: (nodes) => { this.setNodes(nodes); return sim; },
                alphaTarget: () => { return sim; },
                restart: () => { return sim; },
                on: (name: string, callback: () => void) => {
                    if(name === 'tick') {
                        this.onTick = callback;
                    }
                    return sim;
                },
                links: (links) => { this.setLinks(links); return sim; },
            };
            return sim;
        };
    }

    replaceD3Attr() {
        if((window as any)['d3']) {
            const d3 = (window as any)['d3'];
            const me = this;

            let origSelectionAttr = d3.selection.prototype.attr;
            d3.selection.prototype.attr = function(name, value) {
                if((name === 'cx' || name === 'cy') && value) {
                    me.setNodePositions(this, name, value);
                }

                return origSelectionAttr.apply(this, arguments);
            };
        }
    }

    setNodePositions(selection, attrName, value) {

    }
    
    private setupWorkerCommunication() {
        this.worker.onmessage = (event) => {
            switch (event.data.type) {
                case "tick":
                
                    const nodes = event.data.nodes;

                    if(!nodes) {
                        return;
                    }
                
                    for(let i = 0; i < nodes.length; i++) {
                        for(let key in nodes[i]) {
                            this.nodes[i][key] = nodes[i][key];
                        }
                    }
                    
                    if(event.data.links) {
                        const links = event.data.links;
                        
                        for(let i = 0; i < links.length; i++) {
                            for(let key in links[i]) {
                                this.links[i][key] = links[i][key];
                            }
                        }
                    }
                    else
                    {
                        for(let i = 0; i < this.links.length; i++) {
                            try {
                                if(typeof this.links[i].source === 'object') {
                                    this.links[i].source.x = this.nodesById[this.links[i].source.id].x;
                                    this.links[i].source.y = this.nodesById[this.links[i].source.id].y;
                                    this.links[i].target.x = this.nodesById[this.links[i].target.id].x;
                                    this.links[i].target.y = this.nodesById[this.links[i].target.id].y;
                                }
                            } catch(e) {
                                safeErrorLog(e);
                                safeErrorLog(this.links[i].source);
                            }
                        }
                    }
                
                    //console.log(this.nodes[0].x);
                    //this.links = event.data.links;
                    return this.onTick();
            }
        };
    }
    
    private setNodes(nodes) {
        this.nodes = nodes;
        for(let node of nodes) {
            this.nodesById[node.id] = node;
        }
        this.worker.postMessage({ nodes: nodes });
    }
    
    private setLinks(links) {
        this.links = links;
        this.worker.postMessage({ links: links });
    }
    
    private sendToWorker(msg: CanvasForceWorkerMessage, data?: any) {
        this.worker.postMessage(msg, data);
        //console.log(roughSizeOfObject(msg));
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