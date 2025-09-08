# RZ/G Gateway Solution & Demo Samples #
The Patch directory contains all the patches that will allow AWS IoT Greengrass to be built on top of the Verified Linux Package:
- For the RZ/G2L Evaluation Board Kit (EVK), the patches also add RAUC support for Over-The-Air (OTA) updates.
- For the RZ/G3S Evaluation Board Kit (EVK), the patches also enable I2C data reads from PMOD sensors.

Demo samples are also available:
- For the RZ/G2L EVK:

  EV Charging Station - The RZ/G2L board simulates an EV charging station and sends EV metering data with OCPP v2.0.1 protocol to AWS Cloud based Charging Station Management System (CSMS) Web UI.

  Firmware OTA Update - AWS Cloud based Web UI to handle and trigger RZ/G2L board Firmware OTA update.

  Home Automation - [under preparation]
- For the RZ/G3S EVK:

  Basic AWS Cloud Connectivity - the python sample script that will send sensors data from the RZ/G3S board to AWS Cloud.

To build the Linux environment and run the demo samples please follow the instructions from the following Getting Started Guide.

URL: **[https://renesas-wiki.atlassian.net/wiki/spaces/REN/pages/1018405/RZ+Gateway+Solution+-+Getting+Started+Guide](https://github.com/renesas-rz/rz-gateway-solution/edit/main/README.md)** \
