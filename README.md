# CANopenEditor_Web

Angular-based user interface for the CANopen object dictionary. It is a reimplementation of the desktop
application CANopenEditor (https://github.com/CANopenNode/CANopenEditor).

Only the XDD file format (CiA 311) is supported for reading and writing. EDS, DCF, XDC, documentation, and
C source code are neither imported nor exported. XDD 1.0 files can be opened. When saved, the file is
converted into a normalized XDD 1.1 format containing the device identity, file information, object
dictionary, baud rates, and network features. Any other XML fragments are not preserved.

Import from and export to other formats is possible using the EDSSharp-CLI tool, see the releases
page https://github.com/protronic/CANopenEditor/releases.
