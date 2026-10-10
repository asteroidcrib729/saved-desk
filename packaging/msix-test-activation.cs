using System;
using System.Runtime.InteropServices;
public static class SavedDeskMsixActivation {
 [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 private interface IActivationManager {
  [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string id, [MarshalAs(UnmanagedType.LPWStr)] string args, uint options, out uint pid);
  [PreserveSig] int ActivateForFile([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr items, [MarshalAs(UnmanagedType.LPWStr)] string verb, out uint pid);
  [PreserveSig] int ActivateForProtocol([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr items, out uint pid);
 }
 [ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
 private class ActivationManager { }
 public static int Activate(string id) {
  IActivationManager manager = (IActivationManager)new ActivationManager();
  try { uint pid; int result=manager.ActivateApplication(id,"",0,out pid); Marshal.ThrowExceptionForHR(result); return checked((int)pid); }
  finally { Marshal.ReleaseComObject(manager); }
 }
}
