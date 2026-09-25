export namespace main {
	
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

