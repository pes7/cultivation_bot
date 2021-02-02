const { Telegraf } = require('telegraf')
const { log } = require('console');
const { brotliCompress } = require('zlib');
const arGs = require('./commandArgs');
const MongoClient = require("mongodb").MongoClient;

const token = "1063342985:AAHvN1QdZUt90BAsdo-Qc3as7pGz-HaspNA";
const bot = new Telegraf(token)

bot.use(arGs());

/*MONGO*/
const _DB = "Bot";
const _tables = {
  _usersTable:"Users",
  _sectTable:"Sects"
};
const _setting = { useUnifiedTopology: true,connectTimeoutMS: 30000,keepAlive: 1 };
const _url = 'mongodb://root:password@localhost:27017/';

/*INFO*/
const _helpCommands = 
`/cultivate - Культивировать сколько секунд.
/immortals - Покажет топ культиваторов и их уровень.
`

class User {
  static NAMES;
  Info = {_id:0,_name:''};
  Cultivation = {_level:0,_points:0};
  constructor(from) {
    this.Info._id = from.id;
    this.Info._name = from.first_name;
  }
}

class dbWork {
  static createDBandTABLE(){
    var table = _tables._usersTable;
    dbWork.creatTable(table);
    var table = _tables._sectTable;
    dbWork.creatTable(table);
  }

  static creatTable(table){
    console.log(`Check ${table}`)
    const client = new MongoClient(_url,_setting);
    client.connect(function(err) {
      if (err) { console.log(`Database ${_DB} not EXIST!!! Create IT NOW!!!!`); return false; };
      var db = client.db(_DB);
        db.createCollection(table, function(err, res) {
          if (err) console.log(err);
          console.log(`Collection ${table} created!`);
          client.close();
        });
    });
  }

  static insertUser(user) {
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
        const db = client.db(_DB);
        const collection = db.collection(_tables._usersTable);
        collection.insertOne(user, function(err, result){
            if(err){ 
                return console.log(err);
            }
            client.close();
        });
    });
  }
  
  static updateUserScore(from,points){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if (err) throw err;
      const db = client.db(_DB);
      const collection = db.collection(_tables._usersTable);
      var newvalues = { $set: {'Cultivation._points' : points} }
      collection.updateOne({'Info._id':from.id}, newvalues, function(err, res) {
        if (err) throw err;
        client.close();
      });
    })
  }

  static getUser(from, clb) {
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err);
      const db = client.db(_DB);
      db.collection(_tables._usersTable).findOne({'Info._id':from.id}, function(err, result) {
        if (err) throw err;
        client.close();
        clb(result);
      });
    });
  }

  static getTopUsers(clb){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err);
      const db = client.db(_DB);
      db.collection(_tables._usersTable).find({'Cultivation._points': {$exists: true}}).sort({'Cultivation._points' : -1}).limit(10).toArray(function(err, result) {
        if (err) throw err;
        client.close();
        clb(result);
      })
    });
  }
}

bot.command('cultivate', (ctx) => {
  ctx.reply('Культивирую!');
  var time_arg = ctx.state.command.args[0];
  console.log(`id: ${ctx.update.message.from?.id} name: ${ctx.update.message.from?.first_name} time: ${time_arg}`);

  var time = parseInt(time_arg);
  time = time * 1000;
  function endCultivate(arg) {
    dbWork.getUser(ctx.update.message.from, (user) => {
      if(user == undefined) {ctx.reply('Культивация невозможна, используйте: /start'); return false;}
      arg.reply(`Культивация окончена!`);
      user.Cultivation._points = user.Cultivation._points + time/1000;
      dbWork.updateUserScore(ctx.update.message.from,user.Cultivation._points);
      console.log(`Name: ${user.Info._name}, score: ${user.Cultivation._points}`)
    });
  }
  setTimeout(endCultivate, time, ctx);
})

bot.command('immortals', (ctx) => {
  ctx.reply('Топ безсмертных мира сего:');
  dbWork.getTopUsers((users)=>{
    var list = '';
    var i = 1;
    console.log(users);
    users.forEach(us => {
      list = `${list}${i}: ${us.Info._name}[${us.Cultivation._points}]\n`;
      i++
    });
    ctx.reply(list);
  });
})

bot.start((ctx) => {
  dbWork.getUser(ctx.update.message.from, (user) => {
    if(user == undefined){
      dbWork.insertUser(new User(ctx.update.message.from));
    }
  });
  ctx.reply(`Это культиваторский бот. \n НАЧНИ СВОЮ КУЛЬТИВАЦИЮ!!! \n ${_helpCommands}`)
})
bot.help((ctx) => ctx.reply(`${_helpCommands}`))

bot.on('text', (ctx) => {
  //console.log(ctx)
  //const scores = ctx.db.getScores(ctx.message.from.username)
  //return ctx.reply(`${ctx.message.from.username}: ${scores}`)
})

//EXEC once
dbWork.createDBandTABLE();
bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))