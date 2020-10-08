import '../worker-loader';
import SyncWorkerImporter = require('worker-loader?inline=true!./syncworker');

export default SyncWorkerImporter;
