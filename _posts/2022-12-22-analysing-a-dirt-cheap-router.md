---
published: true
header:
  teaser: /assets/images/analysing_a_dirt_cheap_router/mcu.jpg
---

Is it possible for a router that costs as much as a typical takeaway to also provide adequate security? In this article, we explore the security features of the least expensive router found on Aliexpress and aim to find the answer.

## Target

![router.jpg]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/router.png)

The target for this investigation is a [CHANEVE](https://www.aliexpress.com/item/32828192776.html) router. It doesn't really have a part number, the actual title of the listing is '*CHANEVE 300Mbps Wireless Repeater Router 802.11N wifi router with Extended Range Rj45 Home camera Surveillance Network Router*', if that narrows it down. At the time of writing, it costs a whopping £12.23 including shipping (after all the extra fees, its about £15).

## Port Scanning

As part of the initial enumeration for Internet-connected devices, you should always perform a port scan to figure out what you are working with/map out the attack surface. I started out with a simple scan using *nmap*, with the *-p-* option to include all ports. This resulted in the following output:

```
Starting Nmap 7.80 ( https://nmap.org ) at 2022-12-22 20:59 GMT
Nmap scan report for 192.168.188.1
Host is up (0.0060s latency).
Not shown: 65532 closed ports
PORT     STATE SERVICE
23/tcp   open  telnet
80/tcp   open  http
1780/tcp open  dpkeyserv

Nmap done: 1 IP address (1 host up) scanned in 21.38 seconds
```

Port 80 corresponds to the HTTP server used for configuration of the router, I will investiate the web server later. Ports 23 and 1780 are also open, port 23 is pretty much always telnet, 1780 is probably some UPnP port (maybe for Wifi Simple Config). Scanning the UDP ports yielded UPnP, DNS, and DHCP ports (52, 67 and 1900), so not very important.

### Telnet?

The telnet port is interesting, exposed telnet interfaces are pretty common on older routers, some of them even have no password if you're lucky (or unlucky if its your router).

We know that the default credentials use the username '*admin*', trying this yields an `invalid username` repsonse. Next I tried '*root*', and this got me to the password entry section. I tried '*admin*', empty input, and a bunch of other passwords - none of which yielded anything interesting. Looks like we will have to have a dig around the firmware if we can get to it!

## Hardware

Prising the lid off of the router (and breaking a few clips in the process) revealed the PCB. The underside of the PCB is uninteresting (it is basically single-sided) so I have only showed the top.

![hardware.jpg]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/hardware.jpg)

There are three main points of interest, can you spot them?

### MCU

The first interesting element is the MCU, this is a *Mediatek MT7628KN* chip ([datasheet](https://files.seeedstudio.com/products/114992470/MT7628_datasheet.pdf)), which is commonly used in low-cost extenders, and evidently also routers. It is described as a router on a chip, as it provides all of the functionality needed for a router on, you guessed it, a single chip.

![mcu.jpg]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/mcu.jpg)

### EEPROM

Another smaller chip is seen on the board, this is a *Zbit 25VQ32BSIG* serial EEPROM chip ([datasheet](https://datasheet.lcsc.com/lcsc/2003141132_Zbit-Semi-ZB25VQ32BSIG_C495744.pdf)). This chip likely contains all of the firmware that the device runs, so we will need to somehow extract its contents.

![eeprom.jpg]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/eeprom.jpg)

### Debug Interface

If you look closely, there is a pretty obvious UART interface near the EEPROM. These interfaces are pretty common in routers, sometimes they are disabled - I doubt that is the case for a router in this price range. To see what functionality this provides, we will need to connect to the interface and figure out its baud rate (basically the speed of the interface).

![uart.jpg]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/uart.jpg)

## UART

The UART interface uses a standard baud rate of 57600, I figured this out mainly by trial and error - this is the first device I have messed with that uses a baud rate that isn't 9600 or 115200!

### Boot Logs

Hooking a USB to TTL device up to the UART interface yielded some interesting logs full of useful information, here are some of the most interesting parts:
- *U-Boot 1.1.3 (Mar 15 2017 - 15:14:56)*
- *Ralink UBoot Version: 4.3.0.0*
- *Boot image details: image name: zxrouter, image type: MIPS Linux Standalone Program, Data size:  Data Size: 906524 Bytes = 885.3 kB*
- *[00000628][SYS] Ver 2.1.2.121  Mon Jan 15 15:10:01 2018*
- *[UPNPD]Bind IP:192.168.188.1, Port:1780*

This answers the port 1780 question, it is used for UPnP (Universal Plug n Play). We can also see details of the firmware image, such as name and size. Uboot is also present on the router, so we should be able to interrupt the boot sequence and enter a command line with the ability to dump the flash if needed.

Googling *zxrouter* yields some boot logs for some other devices, such as the [Xiaomi WiFi+](https://nm-projects.de/2017/12/first-impression-on-the-xiaomi-wifi/).

### Command Line

Once the boot has completed, you are able to send messages to the router, and the router presents a stripped down command line. There are three 'modules' with an array of commands between them, the following tree represents all the commands and subcommands:

```
cmd
    cfg
    	get, set, del, prof
    net
    	show, br, eth, mon, ping, dhcpc, dhcpd, arp, pppoe, ntp, dns, ipnat, route, upnp, timer, http, ifconfig, ated, rtdot1xd
    os 
    	thread, mem, spi, reg, cpuload, cpubusy, event
```

Lots of interesting commands to look into!

### Dumping the Flash Chip

We want to get the contents of the flash chip, and there is an `spi` command in the `os` section that lets us read contents of the memory chip. It can also be used to write the chip, which could be useful.

So lets try and dump the contents of the chip using this *spi* command. I tried dumping the entire contents in a single command, but I was getting some *malloc* error, so I needed to dump smaller chunks. Executing the following commands, and stitching the outputs, seemed to work:

```
spi rd 0 524288
spi rd 80000 524288
spi rd 100000 524288
spi rd 180000 524288
```

Dumping anything after 0x200000 resulted in the same output as the first command. Most of the last block is just `0xff`'s, which makes sense looking at the size of the firmware image.

## Extracting Firmware

So now we have a log containing all of the chip contents, but in its current text form it isn't very useful. I threw together a really simple Python script that allowed me to convert the text output into a raw binary that perfectly matched the contents of the memory chip. Running binwalk on the extracted binary yields the following output:

```
DECIMAL       HEXADECIMAL     DESCRIPTION
--------------------------------------------------------------------------------
72032         0x11960         U-Boot version string, "U-Boot 1.1.3 (Mar 15 2017 - 15:14:56)"
327680        0x50000         uImage header, header size: 64 bytes, header CRC: 0x58298B38, created: 2018-01-15 07:11:30, image size: 906524 bytes, Data Address: 0x80500000, Entry Point: 0x80500000, data CRC: 0xB453F3DA, OS: Linux, CPU: MIPS, image type: Standalone Program, compression type: none, image name: "zxrouter"
337024        0x52480         LZMA compressed data, properties: 0x5D, dictionary size: 8388608 bytes, uncompressed size: 2496104 bytes
```

Thats a good sign! We can see a uboot header, and an LZMA header, which is a compressed data block. We can use binwalk's *-e* option to extract the compressed block.

If we run binwalk on the extracted file, we see lots of references to eCos RTOS, which is likely the operating system it is using. To see the RTOS tasks, we can run the `os thread` command (this command also allows us to change thread priority, suspend/kill threads, etc):

```
OS>thread
id    state    Pri(Set) Name                      StackBase   Size   usage

---------------------------------------------------------------------------

0001  RUN      31 ( 31) Idle Thread               0x802b50d8  2048   1136
0002  EXIT     10 ( 10) main                      0x802b5f60  8192   3040
0003  SLEEP    6  ( 6 ) Network alarm support     0x80297378  4096   1840
0004  SLEEP    7  ( 7 ) Network support           0x80295f64  4096   2348
0005  SUSP     30 ( 30) cpuload                   0x80295680  2048   592
0006  SLEEP    8  ( 8 ) SYSLOG Daemon             0x8029a854  4096   1388
0007  SLEEP    4  ( 4 ) RtmpTimerTask             0x802da740  4096   936
0008  SLEEP    4  ( 4 ) RtmpCmdQTask              0x802d8438  4096   904
0009  SLEEP    4  ( 4 ) RtmpWscTask               0x80345f60  4096   304
0010  SLEEP    4  ( 4 ) RtmpMlmeTask              0x802d95e8  4096   1760
0011  SLEEP    8  ( 8 ) DHCP server               0x8029930c  5120   3972
0012  SLEEP    9  ( 9 ) DNS_daemon                0x802b342c  6144   2988
0013  SLEEP    15 ( 15) NTP Client                0x802b1110  8192   388
0014  SLEEP    8  ( 8 ) HTTPD_daemon              0x8026a794  4096   916
0015  SLEEP    8  ( 8 ) HTTPD_proc                0x8026b794  16384  5900
0016  RUN      8  ( 8 ) CLI_thread                0x80292ff0  8192   2688
0017  SLEEP    16 ( 16) upnp_main                 0x802cdafc  4096   1020
0018  SLEEP    5  ( 5 ) monitor_thread            0x802675a0  8192   756
0019  SLEEP    10 ( 10) extender_check            0x80262c80  14336  5592
0020  SLEEP    8  ( 8 ) upnp_daemon               0x802a9a5c  8192   820
0021  SLEEP    8  ( 8 ) wsc msg monitor thread    0x802aeebc  8192   236
0022  SLEEP    8  ( 8 ) wscNLEventHandle          0x802abf6c  8192   584   
```

We can also see HTML and XML documents in the extracted file, so it looks like it has extracted properly.

## Loading Firmware

We know the architecture of the Processor is MIPS 32 little-endian, so we can use these settings to decompile the extracted firmware in Ghidra.

Loading the converted dump into Ghidra with the above settings, we can see the bootloader code has been decompiled. Running strings on the binary yields the text segment used by the bootloader, so it seems the bootloader is not compressed (which makes sense as it has to decompress everything else). Everything else is still compressed so obviously won't reveal anything interesting, we need to go deeper. 

We obviously want to find the code that is running on the device after the boot procedure has completed. Using binwalk to extract the extracted binary again, and running `strings` on the this, yields the text segment for the code decompressed by the bootloader - our code must be here. 

We need to find the base address to see anything interesting in Ghidra (otherwise the memory addresses will be completely off), there are plenty of ways to find the base address, e.g., [basefind2](https://github.com/soyersoyer/basefind2). In this case, the base address is *0x80000400*, so we need to set this in the *Memory Map* section of Ghidra.

![mem_map.PNG]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/mem_map.PNG)

Setting this address in the memory map yields a decent decompilation with some errors here and there, but looking at the output for a brief period, it looks like these will need some manual fixing (LAB instead of FUN, etc). 

### Telnet Backdoor Password

Now that we have the firmware extracted, we can try and find the password for the telnet backdoor. We know that the username is '*root*', so lets search for that string. Looking at the nearby strings, I saw a string '*cs2012*' that is also referenced in the same function that '*root*' is. 

![telnet_pwd.PNG]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/telnet_pwd.PNG)

Attempting to use '*cs2102*' as the password yielded a successful login, and showed an identical interface to that seen throuh the UART interface. This telnet backdoor is on by default, so if you are on the network and know the password, you can dump the config and mess with the flash chip. That doesn't sound very secure!

## Web Interface

The default IP of the router is 192.168.188.1, and the default credentials are *admin:admin*. You can change the admin password, but the username is fixed as admin. You are greeted with five options, but you can just use the advanced menu to change basically anything you want.

![web_ui.png]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/web_ui.png)

There really isn't much to the web interface, it just offers all your basic router functionality. The language used/formatting of the interface is indicative that this interface has been translated from another language.

### Authentication

The authentication mechanism uses the HTTP basic authentication. The basic authentication data is just the base64 encoding of the username password pair, so `admin:password` in this case. As this is HTTP, no encryption takes place, so if this is sniffed then thats an easy admin password steal.

![auth.PNG]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/auth.PNG)

The web interface sends the encoded credentials with every request, so a MITM attack is far more damaging. HTTP basic authentication is also very weak, and is easy to brute-force/perform a dictionary attack with something like THC-hydra, just make sure to clear the log once the password is recovered as every attempt is logged!

![attempts.PNG]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/attempts.PNG)

The size of the admin password can be between 1 and 32, there is no minimum size check which is interesting. They also only allow the use of letters and numbers, so if brute forcing the password, you don't need to worry about special characters which is nice of them.

![numbers_and_letters.PNG]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/numbers_and_letters.PNG)

### Capturing Commands

When you execute the commands on the web interface, as they just use HTTP for their communications, we can simply see in plaintext the commands being sent from the web interface to the router. As an example, we can capture the following command that changes the admin password:
- CMD=SYS
- GO=admin.htm
- SET0=16843264

Clearly this is setting the `SYS_ADMPASS` value in the config file, and it is referencing it with some id. Where do these command id's come from?

### The Numbers Mason

Capturing a few more commands, the id doesn't really show any patterns in its decimal form - converting the *SYS_ADMPASS* id to hex yields `0x1010200`, which makes more sense.

![mason.PNG]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/mason.PNG)

Capturing and converting the decimal ID's for a few more entries yielded the following:
- [0-1] : Module ID, e.g. SYS=1, WAN=3
- [2-3] : Value ID, e.g. SYS_ADMPASS, WAN_IP
- [4-5] : Value type:
	- 01 : Number
    - 02 : String
    - 03 : IP address
    - 04 : MAC address
- [6-7] : Always 0

As an example, consider the following value, `LAN_DHCPD_START=192.168.188.2` with id `0x2050300`:
- LAN module, so module id is 2
- 5th command in the LAN module, so command id is 5
- IP address, so type is 3

The values of all id's of the entries can be checked with the *cfg get id* method, which returns the name (and value if there is one) of the associated config entry. Using this command, I noticed that I was able to find values that were not listed in the config, so I made a quick Python script to essentially brute force the id's to get every possible value in the config. This gave me roughly 150 more entries than are visible in the config.

### Updating Any Config Value via HTTP

If we ignore the fact we can just use the telnet backdoor for modifying the config, it would be useful to have another method that can do the same thing via a web request rather than spinning up a bunch of obvious telnet traffic.

We now know the ID's of every entry in the config, so we can now change the `admin password change` payload to modify an entry with some other ID. I put together a quick Python script that allows you to change any config variable to whatever you want (provided the type is correct). Unfortunately, you still need the admin password to perform this arbitrary config modification.

## Getting our Bearings in the Binary

We need to get our bearings in the binary and figure out where important things are, as well as answer some questions from earlier on!

### Telnet & UART Menu

The first aim is to find the functions responsible for the telnet/UART functionality, mainly just as an exercise. Using the *cmd/cfg/os/net* strings allowed me to locate a data structure that lists the command names, handler functions, and help strings. The data structure begins at *0x8025bf80*, and resembles some sort of tree-like data structure. As an example, lets look at the entry for the 'CFG' submenu:

![submenu.PNG]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/submenu.PNG)

We can see the name of the submenu, a pointer to the main subhandler function, and the help item. Looking slightly below, we can see a pointer to the parent CMD menu. Below are the entries for the *net* and *os* commands. We now have all of the handler functions identified.

### Config Values

At address *0x802369d8*, there is a list of all config names, as well as their hex ID's. There seems to be a module called *HW* that is not accessible via the telnet interface, so this could be interesting to look into in future.

![HW_vals.PNG]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/HW_vals.PNG)

### HTTP Commands

The command used for our arbitrary config overwrite was 'SYS', there are several other commands to explore as well, found by looking at the strings nearby to SYS, and capturing more web traffic:
- SYS_LOG_MAIL
- SYS_CONF
- SECURE_LOG
- SYS_LOG
- SYS_PASS
- WAN_CON
- SYS_UPG
- SYS_ULD
- LAN_DHC
- RT_ADD
- WIRELESS_SECURITY
- WIRELESS_SIMPLE_CONFIG_DEVICE
- ACL
- NTP

Sending HTTP payloads with the command parameter set to some of the above values yielded some results, for example, sending a post request with CMD set to SYS_LOG clears the system log. Other values yield some output in the telnet/UART output, but its difficult to see what these commands are doing without looking at the firmware.

Starting around *0x80237938*, we can see some of the handler functions for various pages and respective parameters, so we can fully emulate the web interface with the knowledge these functions provide. For example, lets look at the /do_cmd.htm request structure, we can see from the function that it is expecting *GO*, *FLG* and *CMD* parameters.

At address *0x8023812c*, we find another table with possible CMD's, and their respective handler functions. I also located the function that handles the CMD parameter of the HTTP payload at address *0x8000f6d4*, we know this function is correct as making a HTTP request with some of the modules results in `cgi_result=1` output in the telnet console. I also missed a few other commands in different locations (stupid compiler optimisations):
- WIRELESS_SIMPLE_CONFIG_RESET
- HW_VLAN
- QOS
- SYS_OPMODE
- SYS_LANGUAGE_TYPE
- DHCP

### HTTP Authentication

The function that handles the authentication is seen at *0x8000ffdc*, and the check that is setting the HTTP code to 401 in the HTTP handler function is seen at *0x80011e28*. Basically, the HTTP handler passes the admin/password combo into the HTTP authentication function, and if this function returns 0 then the command is executed. So in an ideal world we could either bypass the check, or get the check to somehow return 0.

It is possible to brute force/password spray the admin password of the router. I achieved around 136 password attempts/sec over WiFi, which isn't great, but is still far from ideal (you can get around 1200/s if connected via Ethernet).

![bruteHTTP.PNG]({{site.baseurl}}/assets/images/analysing_a_dirt_cheap_router/bruteHTTP.PNG)

### Thread Functions

Using the names of the threads, I was able to locate the function that creates the thread at address *0x8019acb0*. The function takes the thread priority, thread name, and the function to be run by the thread. There are some thread create calls that take parameters, so these needed a little bit more reversing.

We now have the addresses for the thread functions:
- Network alarm support : *0x8012d1f8*
- Network support : *0x8012bb60*
- cpuload : *0x8011fd70*
- SYSLOG Daemon : *0x8015b998*
- DHCP server : *0x8015a708*
- DNS_daemon : *0x80198484*
- NTP Client : *0x80195b10*
- HTTPD_daemon : *0x800127fc*
- HTTPD_proc : *0x80012458*
- CLI_thread : *0x8011c6f0*
- upnp_main : *0x801882e8*
- monitor_thread : *0x800059f0*
- extender_check : *0x8000376c*
- upnp_daemon : *0x80188500*
- wsc msg monitor thread : *0x801949b4*
- wscNLEventHandle : *0x80191cf0*
- RtmpMlmeTask : *0x80069d20*
- RtmpWscTask : *0x800dd078*
- RtmpTimerTask : *0x800986a0*
- RtmpCmdQTask : *0x800b5f90*

Also some thread initialisations that are not found in the thread list:
- PPPX_daemon : *0x8017591c*
- DHCPC : *0x80157190*
- MPSThread : *0x8010f37c*

## Conclusion

As expected, the security on this device is pretty terrible. We found a pre-auth telnet backdoor which basically opens up the entire device, use of weak HTTP authentication for the admin panel with terrible default credentials, and there is likely a fair few more issues deeper in the firmware (which we were able to extract and perform a quick surface-level analysis on). I'd spend some more time analysing the firmware, but telnet gives you all the control over the router you would ever need!

The main lesson learned here is that you usually get what you pay for, so don't cheap out on your router! I combined all of the tools I created into a single Python script, as well as the firmware images I extracted, and put it on [my Github, feel free to take a look!](https://github.com/luke-r-mills/Aliexpress-Router)
