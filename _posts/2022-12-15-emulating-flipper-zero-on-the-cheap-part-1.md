---
published: false
---
In this series of blogs, I will be attempting to emulate the IR recording/replaying functionality of the popular Flipper Zero device on the cheap.

## Why?

The Flipper Zero is one of the most hyped hacking devices in 2022, and for good reason, it is a really cool gadget that can do some really cool things. My favourite is the IR replaying functionality, where you can record and replay captured IR signals. Its a pentesters dream! However, the price tag is a little steep for my liking, so I'm going to try and get this functionality on the cheap!

![flipper.jpg]({{site.baseurl}}/images/flipper_zero_on_the_cheap/flipper.jpg)

Part 1 of this blog series goes over the project goals, the selected hardware, a teardown of the hardware, and looking at some extracted UART logs. This blog will essentially go over my standard approach for initial enumeration of hardware.

## Project Goals

The goals of this project:
- Must be able to capture and replay IR signals
- Must be portable (maybe not to the extent the flipper zero is)
- Ideally able to run off of a USB battery pack and laptop/mobile

## Weapon of Choice

For this project, I chose the Tuya S11 IR/RF replayer. This thing is cheap and does the same stuff the Flipper Zero does (in terms of IR functionality), for a price under £10. Its powered via micro USB, and can emulate basically any remote control your heart desires.

![s11.png]({{site.baseurl}}/images/flipper_zero_on_the_cheap/s11.png)

If you are unfamiliar with Tuya IoT devices, they are essentially an app-cloud-device combo. Tuya provides the app (Tuya Smart) and the cloud functionality (usually including the chip), and the manufacturer just uploads some code on the chip using their SDK and slaps it in some hardware. It allows manufacturers with a lower budget to get app/cloud functionality without having to host it themselves, this is good for them, but usually bad for security!

## Hardware

With the shell prised off, the PCB of the board is exposed, and we can see all the components:

![hardware.png]({{site.baseurl}}/images/flipper_zero_on_the_cheap/hardware.png)

The first thing that immediately stands out is the large 'star' of IR blasters on the top of the device, these allow the device to send IR signals in all directions, making the device position independent. You also have the receiver, which is used for recording IR signals for replaying. The only other thing on the top of the device is the activity indicator LED.

On the bottom of the device, we can see the micro USB connector, the reset button, and a couple of modules soldered onto the main PCB. The first module of interest is the CBU module, the datasheet is made available [by Tuya](https://developer.tuya.com/en/docs/iot/cbu-module-datasheet?id=Ka07pykl5dk4u). This seems to be the module that allows WiFi connectivity, and the datasheet also mentions Bluetooth Low Energy (BLE) functionality. It boasts the BK7231N RF chip, and a few peripherals (5 PWMs, 2 UARTs, and 1 SPI).

The next module is the SH4 module, again, the datasheet has been made available [by Tuya](https://developer.tuya.com/en/docs/iot/sh4-module-datasheet?id=Ka04qyuydvubw). This module seems to be the module responsible for the RF transmission, made obvious by the very large antenna. This module uses the CMTOV30-EQR RF tranceiver chip and some peripherals (3 GPIOs, and 1 SPI).

## Exploring UART2 Logs

The datasheet for the CBU indicates that there are two UART interfaces to mess about with. The datasheet mentions that UART2 is used for logging, so lets see if this is outputting anything useful. 

There aren't any nice connection points on the PCB, so I will need to solder some wires directly to the module, namely the *UART2_TX*, *UART2_RX*, and *GND* pins:

With these soldered, I hooked up my trusty USB to TTL adapter. As this is UART, the *RX* pin of the device must be connected to the *TX* pin on the TTL adapter, and vice versa. Looking at the datasheet, the baud rate of the UART interface isn't clear, but I expected it to be 115200 as this is pretty much the standard.

Connecting this to my computer, and spinning up Putty (you can also use `screen` on Linux), allowed me to extract the logs being output by the device. I recorded both the boot sequence, and also the output when I interacted with the device (replaying commands, recording commands, etc).

![uart.jpg]({{site.baseurl}}/images/flipper_zero_on_the_cheap/uart.jpg)

### Boot

Lets take a look at the boot sequence of the device, and the logs that are output during said boot sequence. As the logs are pretty huge, I will talk about some of the more interesting parts:
- `prvHeapInit-start addr:0x411a50, size:124336` : Start address and size of the heap
- Creates tasks with various priorities, likely using an RTOS (like ESP8266 uses). Tasks listed are: `sys_timer` (5), `cmmod` (4), `wk_th-0` (3)
- `TUYA IOT SDK V:2.3.1` : The SDK version used to compile the firmware
- `BUILD AT:2021_12_06_18_18_28` : When the firmware was built
- `ENCRYPTION:1` : Uh oh, looks like they might be encrypting their firmware
- `gw_cntl.gw_if.firmware_key:keym4vvjhx4sd9kk, input:keym4vvjhx4sd9kk` : Firmware key?
- `tcp_port:62642` : No port scanning needed here!
- `upd login key len:6` : Not sure what this key is, but its got a length of 6
- `ssid:Lhotspot, 1` : SSID of associated network (no password :'( )
- `mqtt get serve ip success` : So this device is using MQTT

### IR Command Recording

For this, I used a simple Arduino IR module remote (they cost barely anything and are a staple in a lot of Arduino projects). I recorded the 1, 2 and 3 keys on the device, and recorded the following output for the 1 button (all identical):

```
[12-18 15:23:04 TUYA Notice][lr:0x5a10d] ir study start...
[12-18 15:23:04 TUYA Notice][lr:0xa97d5] ble get conn stat:4
[12-18 15:23:04 TUYA Notice][lr:0xa9801] ble_sdk_send skip, no connect:4
[12-18 15:23:06 TUYA Notice][lr:0x59f21] REV MAG_ID:1
[12-18 15:23:06 TUYA Notice][lr:0xa97d5] ble get conn stat:4
[12-18 15:23:06 TUYA Notice][lr:0xa9801] ble_sdk_send skip, no connect:4
[12-18 15:23:06 TUYA Notice][lr:0x59ef9] remain size:36920
```

So when it is recording a command, it enters *IR study*, and will save detected IR commands. I am unsure why it mentions BLE so much, the CBU module does support bluetooth so probably an alternative connection method to WiFi. It also prints out the remaining size of something, either the heap, or some persistent storage.

### IR Command Replaying

```
[12-18 15:24:40 TUYA Notice][lr:0xa97d5] ble get conn stat:4
[12-18 15:24:40 TUYA Notice][lr:0xa9801] ble_sdk_send skip, no connect:4
[12-18 15:25:57 TUYA Notice][lr:0x59f21] REV MAG_ID:0
[12-18 15:25:57 TUYA Notice][lr:0x59f9d] data_num: 76, freq: 38000, frame_num: 1, delay: 300
[12-18 15:25:58 TUYA Notice][lr:0x59ff7] ir_send result -> succ!
[12-18 15:25:58 TUYA Notice][lr:0x59ef9] remain size:38152
```

Similar BLE checks in the comand replaying, as well as the printing of some heap/flash size. We can also see some details of the sent IR signal, including frequency and delay. The `data_num` is consistent for all three recordings.

## Conclusion

So now we have introduced the project and have a bunch of UART logs to help identify functions when we get the binary and decompile it. In the next blog, we will figure out how to get the firmware off of the device, and load it into Ghidra to find interesting functions and analyse how everything works at a much lower level.
