import SetPropertyQueueData from "./set-property-queue-data";
import {VdomNode} from "./vdom";

class CompleteSetPropertyQueueData {
    'raw': SetPropertyQueueData;
    'shared': {
        [attrName: string]: Int32Array
    };
}

export default class SetPropertyQueue {
    private data: CompleteSetPropertyQueueData = {'raw': {}, 'shared': {}};
    //private sharedData: {[attrName: string]: SharedArrayBuffer} = {};
    private useSharedArrayFor = ['cx', 'cy', 'x1', 'x2', 'y1', 'y2', 'x', 'y'];
    public static BUFFER_PRECISION_FACTOR = 10;

    ensureInitialized(attrName: string, useBuffer: boolean, numNodes?: number) {
        if(attrName === 'class') {
            attrName = 'className';
        }

        if(!useBuffer || this.useSharedArrayFor.indexOf(attrName) === -1) {
            if(!this.data.raw[attrName]) {
                this.data.raw[attrName] = [];
            }
        } else {
            if(!this.data.shared[attrName]) {
                const length = numNodes < 500 ? 1000 : numNodes * 2;
                const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * length);
                const values = new Int32Array(buffer);

                // If values have been previously set without a buffer, transfer them.
                if(this.data.raw[attrName] &&
                    !(this.data.raw[attrName] instanceof SharedArrayBuffer)) {
                    const prevData: string[] = <any> this.data.raw[attrName];

                    prevData.forEach((value, index) => {
                        values[index] = parseFloat(value) * SetPropertyQueue.BUFFER_PRECISION_FACTOR;
                    });
                }

                this.data.raw[attrName] = buffer;
                this.data.shared[attrName] = values;
            } else {
                const newLength = numNodes < 500 ? 1000 : numNodes * 2;
                const newByteLength = Int32Array.BYTES_PER_ELEMENT * newLength;
                if(this.data.shared[attrName].byteLength / newByteLength < 0.8) {
                    // Need to allocate more space
                    console.log('more space needed. prev:', this.data.shared[attrName].byteLength / Int32Array.BYTES_PER_ELEMENT, 'new', newLength);
                    const buffer = new SharedArrayBuffer(newByteLength);
                    const values = new Int32Array(buffer);
                    const oldVals = new Int32Array(this.data.shared[attrName]);

                    for(const i in oldVals) {
                        values[i] = oldVals[i];
                    }
                }
            }
        }
    }

    set(element: VdomNode|HTMLElement, attrName: string, value: any, useBuffer: boolean) {
        if(attrName === 'class') {
            attrName = 'className';
        }
        if(element['globalElementIndex'] === undefined) {
            console.error('No index', element);
            throw new Error('Element has no index');
        }
        const index = element['globalElementIndex'];
        const storage = useBuffer && this.useSharedArrayFor.indexOf(attrName) !== -1 ? 'shared' : 'raw';
        try {
            if(storage === 'shared') {
                value *= SetPropertyQueue.BUFFER_PRECISION_FACTOR;
                if(value === 0) {
                    value = 133713371337; // magical constant
                }
            }
            this.data[storage][attrName][index] = value;
        }
        catch(e) {
            console.log(e);
            console.log(this.data, storage, attrName, element, index);
        }
    }

    removePendingChanges(node: VdomNode) {
        /*const selector = element['selector'];
        delete this.setAttrQueue[selector];

        // Update indices
        for(let i = index; i < this.nodesToElements.nodes.length; i++) {
            this.nodesToElements.nodes[i].globalElementIndex = i;
        }

        for(let attrName in this.setAttrQueue[parentSelector]) {
            for(let i = childIndex + 1; i < this.setAttrQueue[parentSelector][attrName].length; i++) {
                this.setAttrQueue[parentSelector][attrName][i-1] = this.setAttrQueue[parentSelector][attrName][i];
            }
        }*/
    }

    get(node: VdomNode, attrName: string) {
        const index = node['globalElementIndex'];
        return this.data.raw[attrName][index];
    }

    getData() {
        return this.data.raw;
    }

    clearData() {
        this.data = {'raw': {}, 'shared': {}};
    }
}
