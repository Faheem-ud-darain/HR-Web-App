import subprocess
import platform

def check_mac_permissions():
    if platform.system() != "Darwin":
        return True
    try:
        check_script = 'tell application "System Events" to get name of first process'
        res = subprocess.run(["osascript", "-e", check_script], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0 and "not allowed" in res.stderr.lower():
            return False
    except Exception:
        pass
    return True

print("Permissions OK:", check_mac_permissions())
