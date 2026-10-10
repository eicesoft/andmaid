//go:build darwin

// Package frame 跨平台窗口外观调整。
package frame

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework AppKit -framework Foundation
#import <AppKit/AppKit.h>
#include <dispatch/dispatch.h>

// 与前端 style.css 的 --radius: 8px 对齐
static const CGFloat andmaidRadius = 8.0;

static BOOL andmaidIsTarget(NSWindow *w) {
	return w != nil && ![w isKindOfClass:[NSPanel class]] && w.contentView != nil &&
		[[w title] hasPrefix:@"Andmaid"];
}

static NSWindow *andmaidMainWindow(void) {
	NSWindow *win = [NSApp keyWindow];
	if (andmaidIsTarget(win)) return win;
	win = [NSApp mainWindow];
	if (andmaidIsTarget(win)) return win;
	for (NSWindow *w in [NSApp windows]) {
		if (andmaidIsTarget(w)) return w;
	}
	// 标题尚未就位时退化为第一个普通窗口
	for (NSWindow *w in [NSApp windows]) {
		if (![w isKindOfClass:[NSPanel class]] && w.contentView != nil) return w;
	}
	return nil;
}

static void andmaidApply(void) {
	NSWindow *win = andmaidMainWindow();
	if (win == nil) return;
	NSView *cv = win.contentView;
	// 背景透明 + 窗口非不透明，圆角外露出桌面；内容区由 WKWebView 不透明绘制
	[win setOpaque:NO];
	[win setBackgroundColor:[NSColor clearColor]];
	cv.wantsLayer = YES;
	cv.layer.cornerRadius = andmaidRadius;
	cv.layer.masksToBounds = YES;
	[win invalidateShadow];
}

void AndmaidRoundWindow(void) {
	if ([NSThread isMainThread]) {
		andmaidApply();
	} else {
		dispatch_async(dispatch_get_main_queue(), ^{
			andmaidApply();
		});
	}
}
*/
import "C"

// RoundWindow 把主窗口裁成 8px 圆角。
// macOS 的 Frameless 窗口是无边框 NSWindow，默认四角为直角，
// 需在原生层裁切（纯 CSS 圆角无法让桌面从窗口四角透出）。
func RoundWindow() {
	C.AndmaidRoundWindow()
}
