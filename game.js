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
  Character = {
    Info:{_id:0,_name:''},
    Cultivation:{_level:0,_points:0},
    TimeOut:{_cultivate:0}
  }
  constructor(from) {
    this.Character.Info._id = from.id;
    this.Character.Info._name = from.first_name;
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
          if (err.code != 48) console.log(err);
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

  static updateUser(user, clb = (tr)=>{ console.log(tr) }){
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if (err) throw err;
      const db = client.db(_DB);
      const collection = db.collection(_tables._usersTable);
      var newvalues = { $set: {Character:user.Character} }
      collection.updateOne({'Character.Info._id':user.Character.Info._id}, newvalues, function(err, res) {
        if (err) {clb(false); return false;};
        clb(true);
        client.close();
      });
    })
  }

  static getUser(from, clb) {
    const mongoClient = new MongoClient(_url, _setting);
    mongoClient.connect(function(err, client){
      if(err) return console.log(err);
      const db = client.db(_DB);
      db.collection(_tables._usersTable).findOne({'Character.Info._id':from.id}, function(err, result) {
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
      db.collection(_tables._usersTable).find({'Character.Cultivation._points': {$exists: true}}).sort({'Character.Cultivation._points' : -1}).limit(10).toArray(function(err, result) {
        if (err) throw err;
        client.close();
        clb(result);
      })
    });
  }
}

bot.command('me', (ctx) => {
  dbWork.getUser(ctx.update.message.from,(user)=>{
    console.log(user);
  })
})

bot.command('cultivate', (ctx) => {
  dbWork.getUser(ctx.update.message.from, (user)=>{
    if(user == undefined) {ctx.reply('Культивация невозможна, используйте: /start'); return false;}
    if(user.Character.TimeOut._cultivate != 0) // Если уже культивируем
    { 
      ctx.reply('Я уже культивирую! Хочешь отменить? \n/clCancle');
      return false;
    } 
    //Начинаем
    ctx.reply('Культивирую!');
    //Аргументы
    var time_arg = ctx.state.command.args[0];
    console.log(`id: ${ctx.update.message.from?.id} name: ${ctx.update.message.from?.first_name} time: ${time_arg}`);
    var time = parseInt(time_arg);
    time = time * 1000;

    //По окончанию
    function endCultivate(arg) {
      dbWork.getUser(ctx.update.message.from,(us)=>{
        arg.reply(`Культивация окончена!`);
        us.Character.Cultivation._points = us.Character.Cultivation._points + time/1000;
        us.Character.TimeOut._cultivate = 0; //Чистим таймаут!
        dbWork.updateUser(us, (tr)=>{ console.log(`cultivate update ${us.Character.Info._name}: ${tr}`) });
        console.log(`Name: ${us.Character.Info._name}, score: ${us.Character.Cultivation._points}`)
      })
    }
    //Сначало это. Моментное действие, user не перечитем.
    let timeout = setTimeout(endCultivate, time, ctx);
    user.Character.TimeOut._cultivate = parseInt(timeout);
    dbWork.updateUser(user);
  })
  
})

bot.command('immortals', (ctx) => {
  ctx.reply('Топ безсмертных мира сего:');
  dbWork.getTopUsers((users)=>{
    var list = '';
    var i = 1;
    console.log(`Show Immortals for ${ctx.update.message.from?.first_name}`);
    users.forEach(us => {
      list = `${list}${i}: ${us.Character.Info._name}[${us.Character.Cultivation._points}]\n`;
      i++
    });
    if(list.length < 1) { ctx.reply('Этот мир девственно чист ;('); return false; }
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