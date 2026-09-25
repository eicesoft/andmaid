import ctypes
from ctypes import wintypes
from PIL import ImageGrab

user32 = ctypes.windll.user32


class RECT(ctypes.Structure):
    _fields_ = [
        ("left", ctypes.c_long),
        ("top", ctypes.c_long),
        ("right", ctypes.c_long),
        ("bottom", ctypes.c_long),
    ]


def dump(hwnd, depth=0):
    tbuf = ctypes.create_unicode_buffer(256)
    cbuf = ctypes.create_unicode_buffer(256)
    user32.GetWindowTextW(hwnd, tbuf, 256)
    user32.GetClassNameW(hwnd, cbuf, 256)
    wr = RECT()
    cr = RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(wr))
    user32.GetClientRect(hwnd, ctypes.byref(cr))
    parent = user32.GetParent(hwnd)
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    style = user32.GetWindowLongW(hwnd, -16) & 0xFFFFFFFF
    ex = user32.GetWindowLongW(hwnd, -20) & 0xFFFFFFFF
    vis = user32.IsWindowVisible(hwnd)
    ind = "  " * depth
    print(
        f"{ind}hwnd=0x{hwnd:X} pid={pid.value} parent=0x{parent:X} class={cbuf.value!r} title={tbuf.value!r}"
    )
    print(
        f"{ind}  wr=({wr.left},{wr.top})-({wr.right},{wr.bottom}) {wr.right-wr.left}x{wr.bottom-wr.top} "
        f"cr={cr.right-cr.left}x{cr.bottom-cr.top} vis={vis} style=0x{style:X} ex=0x{ex:X}"
    )

    @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    def cb(h, l):
        dump(h, depth + 1)
        return True

    user32.EnumChildWindows(hwnd, cb, None)


@ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
def top_cb(h, l):
    tbuf = ctypes.create_unicode_buffer(256)
    user32.GetWindowTextW(h, tbuf, 256)
    cbuf = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(h, cbuf, 256)
    title = tbuf.value
    cls = cbuf.value
    if (
        "Andmaid" in title
        or "andmaid" in title
        or "scrcpy" in title
        or cls == "SDL_app"
        or "804e1e92" in title
    ):
        dump(h)
    return True


user32.EnumWindows(top_cb, None)

host = user32.FindWindowW(None, "Andmaid 内嵌投屏 - 804e1e92")
print("host", hex(host) if host else None)
if host:
    wr = RECT()
    user32.GetWindowRect(host, ctypes.byref(wr))
    img = ImageGrab.grab(bbox=(wr.left, wr.top, wr.right, wr.bottom))
    img.save(r"C:\Users\Kele\Desktop\andmaid\Andmaid\probe_now.png")
    print("shot", img.size, "bbox", wr.left, wr.top, wr.right, wr.bottom)
