var fs = require('fs'),
express = require('express'),
app = express(),
winston = require('winston'),
App = require("app.json"); // Used for configuration and by Heroku

// Includes termination condition
app.is_solution = require("./is_solution.js");
// Other configuration variables 
app.config = App.new(__dirname + "/app.json");

// configure for openshift or heroku
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0'; 
app.set('port', (process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 5555));
app.set('trust proxy', true );
var log_dir = process.env.OPENSHIFT_DATA_DIR || "log";
if (!fs.existsSync(log_dir)){
    fs.mkdirSync(log_dir);
}
// set up static dir
app.use(express.static(__dirname + '/public'))

// set up experimente sequence == experiment ID
var sequence = 0;
var temp = new Date();
var date_str = temp.getFullYear() + "-" + (1 + temp.getMonth()) + "-"+ temp.getDate();

// create logger to console and file
var logger = new (winston.Logger)({
    transports: [
	new (winston.transports.Console)( { level: 'info'} ),
	new (winston.transports.File)({ filename: log_dir+'/nodio-'+date_str+ "-" + sequence+'.log', level: 'info' })
    ]
});

// internal variables
var chromosomes = {},
IPs = {},
workers = {};


// This group of routes is generic and is not related to the algorithm 

// Retrieves the IPs used
app.get('/IPs', function(req, res){
    res.send( IPs );
});

// Retrieves the number of IPs seen
app.get('/IPs/count', function(req, res){
    res.send( { ip_count: Object.keys( IPs).length } );
});

// Retrieves the IPs used
app.get('/workers', function(req, res){
    res.send( workers );
});

// Retrieves the number of workers seen
app.get('/workers/count', function(req, res){
    res.send( { worker_count: Object.keys( workers).length } );
});

// Retrieves the sequence number
app.get('/seq_number', function(req, res){
    res.send( { "number": sequence} );
});


// This group of routes is related to the algorithm. 

// Adds one chromosome to the pool, with fitness
app.put('/experiment/:expid/one/:chromosome/:fitness/:uuid', function(req, res){
    if ( req.params.expid != sequence.toString() ) {
	res.status(410)
	    .send({ current_expid: sequence });
    } else if ( req.params.chromosome ) {
	chromosomes[ req.params.chromosome ] = req.params.fitness; // to avoid repeated chromosomes
	var client_ip;
	if ( ! process.env.OPENSHIFT_NODEJS_IP ) { // this is not openshift
	    client_ip = req.connection.remoteAddress;
	} else {
	    client_ip = req.headers['x-forwarded-for'];
	}

	logger.info("put", { chromosome: req.params.chromosome,
			     fitness: parseInt(req.params.fitness),
			     IP: client_ip,
			     worker_uuid:req.params.uuid} );
	res.send( { length : Object.keys(chromosomes).length });
	if ( app.is_solution( req.params.chromosome, req.params.fitness, app.config.vars.traps, app.config.vars.b ) ) {
	    console.log( "Solution!");
	    logger.info( "finish", { solution: req.params.chromosome } );
	    chromosomes = {};
	    sequence++;
	    logger.info( { "start": sequence });	    
	}
    } else {
	res.send( { length : 0 });
    }
    
});

// Retrieves a random chromosome
app.get('/random', function(req, res){
    if (Object.keys(chromosomes ).length > 0) {
	var keys = Object.keys(chromosomes );
	var one = keys[ Math.floor(keys.length*Math.random())];
	res.send( { 'chromosome': one } );
	logger.info('get');
    } else {
	res.status(404).send('No chromosomes yet');
    }
    
});

// Retrieves the whole chromosome pool
app.get('/chromosomes', function(req, res){
    res.send( chromosomes );
});

// Logs worker info
app.put('/start/:uuid/with/:popsize', function(req, res){
    var client_ip;
    if ( ! process.env.OPENSHIFT_NODEJS_IP ) { // this is not openshift
	client_ip = req.connection.remoteAddress;
    } else {
	client_ip = req.headers['x-forwarded-for'];
    }
    IPs[ client_ip ]=1;
    workers[ req.params.uuid  ]=1;

    logger.info("worker", {
	experiment_id: req.params.expid,
	IP: client_ip,
	worker_uuid:req.params.uuid,
	pop_size:req.params.popsize} );
    res.send( { experiment_id : sequence });

});


// Error check
app.use(function(err, req, res, next){
    //check error information and respond accordingly
    console.error( "Exception in server ", err.stack);
});

// Start listening
app.listen(app.get('port'), server_ip_address, function() {
    console.log("Node app is running at localhost:" + app.get('port'));
    logger.info( { "start": sequence });
})

// Exports for tests
module.exports = app;
