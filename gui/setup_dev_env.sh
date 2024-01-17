#!/bin/bash
python3 -m pip install --user virtualenv
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
pip3 install -r requirements.txt
