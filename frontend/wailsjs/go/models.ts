export namespace adb {
	
	export class Status {
	    running: boolean;
	    version: string;
	    devices: number;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new Status(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = source["running"];
	        this.version = source["version"];
	        this.devices = source["devices"];
	        this.error = source["error"];
	    }
	}

}

export namespace agent {
	
	export class AgentMessage {
	    role: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new AgentMessage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.role = source["role"];
	        this.content = source["content"];
	    }
	}
	export class AgentChatRequest {
	    serial: string;
	    messages: AgentMessage[];
	
	    static createFrom(source: any = {}) {
	        return new AgentChatRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serial = source["serial"];
	        this.messages = this.convertValues(source["messages"], AgentMessage);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace device {
	
	export class AndroidApp {
	    name: string;
	    package: string;
	    system: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AndroidApp(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.package = source["package"];
	        this.system = source["system"];
	    }
	}
	export class Device {
	    serial: string;
	    state: string;
	    model: string;
	
	    static createFrom(source: any = {}) {
	        return new Device(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serial = source["serial"];
	        this.state = source["state"];
	        this.model = source["model"];
	    }
	}
	export class VideoEncoder {
	    codec: string;
	    name: string;
	    hardware: boolean;
	    alias: boolean;
	
	    static createFrom(source: any = {}) {
	        return new VideoEncoder(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.codec = source["codec"];
	        this.name = source["name"];
	        this.hardware = source["hardware"];
	        this.alias = source["alias"];
	    }
	}

}

export namespace filemgr {
	
	export class DeviceStorage {
	    id: string;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new DeviceStorage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.description = source["description"];
	    }
	}
	export class FileEntry {
	    name: string;
	    isDir: boolean;
	    size: number;
	    // Go type: time
	    modTime: any;
	    mode: string;
	
	    static createFrom(source: any = {}) {
	        return new FileEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.isDir = source["isDir"];
	        this.size = source["size"];
	        this.modTime = this.convertValues(source["modTime"], null);
	        this.mode = source["mode"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace settings {
	
	export class AISettings {
	    baseUrl: string;
	    apiKey: string;
	    model: string;
	    temperature?: number;
	    systemPrompt: string;
	
	    static createFrom(source: any = {}) {
	        return new AISettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.baseUrl = source["baseUrl"];
	        this.apiKey = source["apiKey"];
	        this.model = source["model"];
	        this.temperature = source["temperature"];
	        this.systemPrompt = source["systemPrompt"];
	    }
	}
	export class ScrcpySettings {
	    fullscreen?: boolean;
	    stayAwake?: boolean;
	    turnScreenOff?: boolean;
	    showTouches?: boolean;
	    disableScreensaver?: boolean;
	    alwaysOnTop?: boolean;
	    windowBorderless?: boolean;
	    windowX?: string;
	    windowY?: string;
	    windowWidth?: number;
	    windowHeight?: number;
	    windowTitle?: string;
	    videoBitRate?: string;
	    maxSize?: number;
	    maxFps?: number;
	    videoCodec?: string;
	    videoEncoder?: string;
	    videoCodecOptions?: string;
	    videoBuffer?: number;
	    videoSource?: string;
	    displayId?: string;
	    newDisplay?: string;
	    captureOrientation?: string;
	    displayOrientation?: string;
	    angle?: number;
	    crop?: string;
	    noVideo?: boolean;
	    noVideoPlayback?: boolean;
	    noWindow?: boolean;
	    noDownsizeOnError?: boolean;
	    noMipmaps?: boolean;
	    printFps?: boolean;
	    renderDriver?: string;
	    displayImePolicy?: string;
	    noVdDestroyContent?: boolean;
	    noVdSystemDecorations?: boolean;
	    noAudio?: boolean;
	    noAudioPlayback?: boolean;
	    requireAudio?: boolean;
	    audioBitRate?: string;
	    audioBuffer?: number;
	    audioOutputBuffer?: number;
	    audioCodec?: string;
	    audioEncoder?: string;
	    audioCodecOptions?: string;
	    audioSource?: string;
	    audioDup?: boolean;
	    noControl?: boolean;
	    keyboard?: string;
	    mouse?: string;
	    gamepad?: string;
	    mouseBind?: string;
	    otg?: boolean;
	    preferText?: boolean;
	    rawKeyEvents?: boolean;
	    noKeyRepeat?: boolean;
	    noMouseHover?: boolean;
	    legacyPaste?: boolean;
	    noClipboardAutosync?: boolean;
	    shortcutMod?: string;
	    record?: string;
	    recordFormat?: string;
	    recordOrientation?: string;
	    pushTarget?: string;
	    serial?: string;
	    selectUsb?: boolean;
	    selectTcpip?: boolean;
	    tcpip?: string;
	    port?: string;
	    tunnelHost?: string;
	    tunnelPort?: number;
	    forceAdbForward?: boolean;
	    killAdbOnClose?: boolean;
	    verbosity?: string;
	    screenOffTimeout?: number;
	    powerOffOnClose?: boolean;
	    noPowerOn?: boolean;
	    noCleanup?: boolean;
	    pauseOnExit?: string;
	    startApp?: string;
	    timeLimit?: number;
	
	    static createFrom(source: any = {}) {
	        return new ScrcpySettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fullscreen = source["fullscreen"];
	        this.stayAwake = source["stayAwake"];
	        this.turnScreenOff = source["turnScreenOff"];
	        this.showTouches = source["showTouches"];
	        this.disableScreensaver = source["disableScreensaver"];
	        this.alwaysOnTop = source["alwaysOnTop"];
	        this.windowBorderless = source["windowBorderless"];
	        this.windowX = source["windowX"];
	        this.windowY = source["windowY"];
	        this.windowWidth = source["windowWidth"];
	        this.windowHeight = source["windowHeight"];
	        this.windowTitle = source["windowTitle"];
	        this.videoBitRate = source["videoBitRate"];
	        this.maxSize = source["maxSize"];
	        this.maxFps = source["maxFps"];
	        this.videoCodec = source["videoCodec"];
	        this.videoEncoder = source["videoEncoder"];
	        this.videoCodecOptions = source["videoCodecOptions"];
	        this.videoBuffer = source["videoBuffer"];
	        this.videoSource = source["videoSource"];
	        this.displayId = source["displayId"];
	        this.newDisplay = source["newDisplay"];
	        this.captureOrientation = source["captureOrientation"];
	        this.displayOrientation = source["displayOrientation"];
	        this.angle = source["angle"];
	        this.crop = source["crop"];
	        this.noVideo = source["noVideo"];
	        this.noVideoPlayback = source["noVideoPlayback"];
	        this.noWindow = source["noWindow"];
	        this.noDownsizeOnError = source["noDownsizeOnError"];
	        this.noMipmaps = source["noMipmaps"];
	        this.printFps = source["printFps"];
	        this.renderDriver = source["renderDriver"];
	        this.displayImePolicy = source["displayImePolicy"];
	        this.noVdDestroyContent = source["noVdDestroyContent"];
	        this.noVdSystemDecorations = source["noVdSystemDecorations"];
	        this.noAudio = source["noAudio"];
	        this.noAudioPlayback = source["noAudioPlayback"];
	        this.requireAudio = source["requireAudio"];
	        this.audioBitRate = source["audioBitRate"];
	        this.audioBuffer = source["audioBuffer"];
	        this.audioOutputBuffer = source["audioOutputBuffer"];
	        this.audioCodec = source["audioCodec"];
	        this.audioEncoder = source["audioEncoder"];
	        this.audioCodecOptions = source["audioCodecOptions"];
	        this.audioSource = source["audioSource"];
	        this.audioDup = source["audioDup"];
	        this.noControl = source["noControl"];
	        this.keyboard = source["keyboard"];
	        this.mouse = source["mouse"];
	        this.gamepad = source["gamepad"];
	        this.mouseBind = source["mouseBind"];
	        this.otg = source["otg"];
	        this.preferText = source["preferText"];
	        this.rawKeyEvents = source["rawKeyEvents"];
	        this.noKeyRepeat = source["noKeyRepeat"];
	        this.noMouseHover = source["noMouseHover"];
	        this.legacyPaste = source["legacyPaste"];
	        this.noClipboardAutosync = source["noClipboardAutosync"];
	        this.shortcutMod = source["shortcutMod"];
	        this.record = source["record"];
	        this.recordFormat = source["recordFormat"];
	        this.recordOrientation = source["recordOrientation"];
	        this.pushTarget = source["pushTarget"];
	        this.serial = source["serial"];
	        this.selectUsb = source["selectUsb"];
	        this.selectTcpip = source["selectTcpip"];
	        this.tcpip = source["tcpip"];
	        this.port = source["port"];
	        this.tunnelHost = source["tunnelHost"];
	        this.tunnelPort = source["tunnelPort"];
	        this.forceAdbForward = source["forceAdbForward"];
	        this.killAdbOnClose = source["killAdbOnClose"];
	        this.verbosity = source["verbosity"];
	        this.screenOffTimeout = source["screenOffTimeout"];
	        this.powerOffOnClose = source["powerOffOnClose"];
	        this.noPowerOn = source["noPowerOn"];
	        this.noCleanup = source["noCleanup"];
	        this.pauseOnExit = source["pauseOnExit"];
	        this.startApp = source["startApp"];
	        this.timeLimit = source["timeLimit"];
	    }
	}

}

