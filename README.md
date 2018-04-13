bitsum-pool
====================

High performance Node.js (with native C addons) mining pool for Cryptonote based coins, optimized for Bitsum.

Comes with lightweight example front-end script which uses the pool's AJAX API.

#### Installation
Installing pool on different Linux distributives is different because it depends on system default components and versions.

##### On Ubuntu 14 LTS
For now the easiest way to install pool is to use Ubuntu 14 LTS. Thus, all you had to do in order to prepare Ubuntu 14 for pool installation is to run:

```bash
sudo apt-get install git build-essential redis-server libboost1.55-all-dev nodejs-dev nodejs-legacy npm cmake libssl-dev
```

##### On Ubuntu 16 LTS

```bash
sudo apt-get install git build-essential redis-server libboost-all-dev nodejs-dev nodejs-legacy npm cmake libssl-dev
```

Version 0.10.^ of Node.js is most suitable with the actual development stage.
That said, since Ubuntu 16 come with version 4.^ of Node.js you will need to downgrade it (just to run the pool).

```bash
# install n to manage node version to use
sudo npm install -g n
# use node's version 0.10.^
sudo n 0.10
# you can change after to lastest node's LTS by running `sudo n lts`
# learn more with `n --help`
```

#### 1) Downloading & Installing

Clone the repository and run `npm update` for all the dependencies to be installed:

```bash
git clone https://github.com/BitsumFoundation/bitsum_pool.git pool
cd pool
npm update
```

#### 2) Configuration

**Note**: *You need to create a `config.json` file in the pool's root directory using `config.sample.json`,
and a `config.js` file in the website directory using `website/config.sample.js`*.

```bash
cp config_example.json config.json
```

#### 3) Start the pool
> These instructions, assuming your running Node.js version 0.10.^

```bash
node init.js
```

The file `config.json` is used by default but a file can be specified using the `-config=file` command argument, for example:

```bash
node init.js -config=config_backup.json
```

This software contains four distinct modules:
* `pool` - Which opens ports for miners to connect and processes shares
* `api` - Used by the website to display network, pool and miners' data
* `unlocker` - Processes block candidates and increases miners' balances when blocks are unlocked
* `payments` - Sends out payments to miners according to their balances stored in redis


By default, running the `init.js` script will start up all four modules. You can optionally have the script start
only start a specific module by using the `-module=name` command argument, for example:

```bash
node init.js -module=api
```

#### 4) Host the front-end

Simply host the contents of the `website` directory on file server capable of serving simple static files.


Edit the variables in the `website/config.js` file to use your pool's specific configuration.

#### 5) Customize your website

The following files are included so that you can customize your pool website without having to make significant changes
to `index.html` or other front-end files thus reducing the difficulty of merging updates with your own changes:
* `custom.css` for creating your own pool style
* `custom.js` for changing the functionality of your pool website

Then simply serve the files via nginx, Apache, Google Drive, or anything that can host static content.


#### Upgrading
When updating to the latest code its important to not only `git pull` the latest from this repo, but to also update
the Node.js modules, and any config files that may have been changed.
* Inside your pool directory (where the init.js script is) do `git pull` to get the latest code.
* Remove the dependencies by deleting the `node_modules` directory with `rm -r node_modules`.
* Run `npm update` to force updating/reinstalling of the dependencies.
* Compare your `config.json` to the latest example ones in this repo or the ones in the setup instructions where each config field is explained. You may need to modify or add any new changes.

### Setting up Testnet

No cryptonote based coins have a testnet mode (yet) but you can effectively create a testnet with the following steps:

* Open `/src/p2p/net_node.inl` and remove lines with `ADD_HARDCODED_SEED_NODE` to prevent it from connecting to mainnet (Monero example: http://git.io/0a12_Q)
* Build the coin from source
* You now need to run two instance of the daemon and connect them to each other (without a connection to another instance the daemon will not accept RPC requests)
  * Run first instance with `./forknoted --p2p-bind-port 28080 --allow-local-ip`
  * Run second instance with `./forknoted --p2p-bind-port 5011 --rpc-bind-port 5010 --add-peer 0.0.0.0:28080 --allow-local-ip`
* You should now have a local testnet setup. The ports can be changes as long as the second instance is pointed to the first instance, obviously

*Credit to surfer43 for these instructions*


### JSON-RPC Commands from CLI

Documentation for JSON-RPC commands can be found here:
* Daemon https://wiki.bytecoin.org/wiki/Daemon_JSON_RPC_API
* Wallet https://wiki.bytecoin.org/wiki/Bytecoin_RPC_Wallet_API


Curl can be used to use the JSON-RPC commands from command-line. Here is an example of calling `getblockheaderbyheight` for block 100:

```bash
curl 127.0.0.1:18081/json_rpc -d '{"method":"getblockheaderbyheight","params":{"height":100}}'
```


### Monitoring Your Pool

* To inspect and make changes to redis I suggest using [redis-commander](https://github.com/joeferner/redis-commander)
* To monitor server load for CPU, Network, IO, etc - I suggest using [New Relic](http://newrelic.com/)
* To keep your pool node script running in background, logging to file, and automatically restarting if it crashes - I suggest using [forever](https://github.com/nodejitsu/forever)


### Configuring Blockchain Explorer

You need the latest stable version of Forknote for the blockchain explorer - [forknote releases](https://github.com/forknote/forknote/releases)
* Add the following code to the coin's config file:

```
rpc-bind-ip=0.0.0.0
enable-blockexplorer=1
enable-cors=*
```

* Launch forknoted with the corresponding config file
* Change the following line in the pool's frontend config.json:

```
var api_blockexplorer = "http://daemonhost.com:1118";
```


Credits
===

* [LucasJones](//github.com/LucasJones) - Co-dev on this project; did tons of debugging for binary structures and fixing them. Pool couldn't have been made without him.
* [surfer43](//github.com/iamasupernova) - Did lots of testing during development to help figure out bugs and get them fixed
* [wallet42](http://moneropool.com) - Funded development of payment denominating and min threshold feature
* [Wolf0](https://bitcointalk.org/index.php?action=profile;u=80740) - Helped try to deobfuscate some of the daemon code for getting a bug fixed
* [Tacotime](https://bitcointalk.org/index.php?action=profile;u=19270) - helping with figuring out certain problems and lead the bounty for this project's creation
* [fancoder](https://github.com/fancoder/) - See his repo for the changes

License
-------
Released under the GNU General Public License v2

http://www.gnu.org/licenses/gpl-2.0.html