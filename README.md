# Simple Captcha Solver
Although captchas are for keeping bots away, some poorly made captchas intrigue people even more to automate the process of solving them. This project does not use any machine learning or deep learning.
Even the PNG parser is not really compliant with PNG spec as the images provided by the website are limited to palette-indexed 2 bit colors.
It uses simple image processing techniques to solve captchas from a specific website, this was a simple project to get started with image processing.

## Usage
After solving 10-15 captchas manually and putting them in the `known` folder with `answer`.png format, the program can solve the provided captchas in the `data` folder with 100% accuracy. (files in the `known` folder are already enough to solve the captchas in the `data` directory)
You can update the known characters by passing train as the first argument. (`known.json` provided in the repo already has the known characters)
```bash
node index.js train
```
Command below is an example of solving a captcha.
```bash
node index.js solve ./data/123.png
```
You can pass multiple paths to solve multiple captchas.
```bash
node index.js solve ./data/123.png ./data/456.png
```
If you want to time the program, you can pass `-t` or `--time` as an argument.
```bash
node index.js solve ./data/123.png -t
```
Not passing any parameters will start a REPL-like interface that can be used for debugging.
There are no dependencies other than native node modules.
## LICENSE
[MIT](https://choosealicense.com/licenses/mit/)