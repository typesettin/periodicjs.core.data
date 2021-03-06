'use strict';
const path = require('path');
const Promisie = require('promisie');
const fs = Promisie.promisifyAll(require('fs'));
const chai = require('chai');
const expect = chai.expect;
const lowkie = require('lowkie');
const moment = require('moment');
const AdapterInterface = require(path.join(__dirname, '../../index'));
const ExampleSchema = require(path.join(__dirname, '../examples/lowkie_model'));

var Example;
var db;
var connectDB = function () {
  return new Promisie((resolve, reject) => {
    fs.readdirAsync(path.join(__dirname, '../examples'))
      .map(filename => {
        if (/sampledb/.test(filename)) return fs.unlinkAsync(path.join(__dirname, '../examples', filename));
        else return 'skipping';
      })
      .then(() => lowkie.connect(path.join(__dirname, '../examples/sampledb.json')))
      .then(connection => {
        db = connection;
        resolve(db);
      })
      .catch(reject);
  });
};

describe('Loki adapter testing', function () {
  let Adapter;
  before(done => {
    connectDB()
      .then(() => {
        Example = lowkie.model('Example', ExampleSchema);
        done();
      }, done);
  });
  after(done => {
    fs.readdirAsync(path.join(__dirname, '../examples'))
      .map(filename => {
        if (/sampledb/.test(filename)) return fs.unlinkAsync(path.join(__dirname, '../examples', filename));
        else return 'skipping';
      })
      .then(() => done())
      .catch(done);
  });
  describe('Basic adapter testing', () => {
    before(() => {
      Adapter = AdapterInterface.create({ adapter: 'loki', model: Example });
    });
    it('Should set the Example model', () => {
      expect(Adapter.model.name).to.equal('Examples');
    });
  });
  describe('Custom loki instance testing', () => {
    let CustomInstanceAdapter;
    before(() => {
      CustomInstanceAdapter = AdapterInterface.create({ adapter: 'loki', model: Example, db_connection: db });
    });
    let person = {
      contact: {
        first_name: 'ADistinctName',
        last_name: 'World',
        dob: moment('12/02/1990', 'MM/DD/YYYY').format()
      }
    };
    it('Should be able to create a document when creating an adapter with a custom db connection', done => {
      CustomInstanceAdapter.create({ newdoc: Object.assign({}, person), skip_xss: true })
        .try(result => {
          expect(result.contact.first_name).to.equal('ADistinctName');
          expect(result._id).to.be.ok;
          done();
        })
        .catch(done);
    });
  });
  describe('Adapter .create method testing', () => {
    let person = {
      contact: {
        first_name: 'Hello<script>alert("hello");</script>',
        last_name: 'World',
        dob: moment('12/02/1990', 'MM/DD/YYYY').format()
      }
    };
    it('Should be able to create a document and skip escaping', done => {
      Adapter.create({ newdoc: Object.assign({}, person), skip_xss: true })
        .try(result => {
          expect(result.contact.first_name).to.equal('Hello<script>alert("hello");</script>');
          expect(result._id).to.be.ok;
          done();
        })
        .catch(done);
    });
    it('Should enforce character escaping with defaults if options.html_xss is true', done => {
      Adapter.create({ newdoc: Object.assign({}, person), html_xss: true })
        .try(result => {
          expect(/^Hello&lt;/.test(result.contact.first_name)).to.be.true;
          expect(result._id).to.be.ok;
          done();
        })
        .catch(done);
    });
    it('Should enforce basic character escaping if options.html_xss is false', done => {
      Adapter.create({ newdoc: Object.assign({}, person) })
        .try(result => {
          expect(result.contact.first_name).to.equal('Helloalert("hello");');
          expect(result._id).to.be.ok;
          done();
        })
        .catch(done);
    });
    it('Should be able to create document if options.newdoc is undefined and options is the document', done => {
      Adapter.create(Object.assign({}, person))
        .try(result => {
          expect(result._id).to.be.ok;
          done();
        })
        .catch(done);
    });
    it('Should respect callback function if argument is passed', done => {
      Adapter.create({ newdoc: Object.assign({}, person) }, (err, result) => {
        expect(result._id).to.be.ok;
        done();
      });
    });
    it('Should be able to batch create documents if bulk_create options is true', done => {
      let newdoc = [{
        contact: {
          first_name: 'Fizz',
          last_name: 'Buzz',
          dob: moment('01/06/1990', 'MM/DD/YYYY').format()
        }
      }, {
        contact: {
          first_name: 'Foo',
          last_name: 'Bar',
          dob: moment('01/07/1990', 'MM/DD/YYYY').format()
        }
      }, {
        contact: {
          first_name: 'Alice',
          last_name: 'Bob',
          dob: moment('01/08/1990', 'MM/DD/YYYY').format()
        }
      }];
      Adapter.create({ newdoc, bulk_create: true })
        .try(result => {
          expect(result).to.be.an('array');
          expect(result.filter(data => data._id).length).to.equal(3);
          done();
        })
        .catch(done);
    });
  });
  describe('Adapter .query method testing', () => {
    let query = {
      'contact.first_name': { $regex: /^hello/i }
    };
    before(() => {
      Adapter = (Adapter) ? Adapter : AdapterInterface.create({ adapter: 'loki', model: Example });
    });
    it('Should be able to query for applications and use default options', done => {
      Adapter.query({ query })
        .try(result => {
          expect(Array.isArray(result)).to.be.true;
          expect(/hello/i.test(result[0].contact.first_name)).to.be.true;
          done();
        })
        .catch(done);
    });
    it('Should be able to query for applications with custom options', done => {
      Adapter.query({ query, limit: 1, fields: { contact: 1 } })
        .try(result => {
          expect(Array.isArray(result)).to.be.true;
          expect(result.length).to.equal(1);
          //expect(result[0].createdat).to.not.be.ok;
          done();
        })
        .catch(done);
    });
    it('Should be able to handle pagination', done => {
      Adapter.query({ query, paginate: true, pagelength: 2, limit: 5 })
        .try(result => {
          expect(result).to.be.an('object');
          result = Object.keys(result).filter(key => {
            return (result[key].documents && result[key].count);
          });
          expect(result.length).to.equal(3);
          done();
        })
        .catch(done);
    });
    it('Should respect callback if arguement is passed', done => {
      Adapter.query({ query }, (err, result) => {
        if (err) done(err);
        else {
          expect(result).to.be.an('array');
          done();
        }
      });
    });
  });
  describe('Adapter .search method testing', () => {
    before(() => {
      Adapter = (Adapter) ? Adapter : AdapterInterface.create({ adapter: 'loki', model: Example });
    });
    it('Should be able to handle a normal query object', done => {
      let query = {
        'contact.first_name': { $regex: /^hello/i }
      };
      Adapter.search({ query })
        .try(result => {
          expect(result).to.be.an('array');
          //expect(result[0]).to.have.property('createdat');
          done();
        })
        .catch(done);
    });
    it('Should be able to handle a query string', done => {
      let query = 'World,Foobar,Fizzbuzz';
      let search = 'contact.last_name';
      Adapter.search({ query, search, delimeter: ',' })
        .try(result => {
          expect(result).to.be.an('array');
          let splitquery = query.split(',');
          expect(result.filter(value => splitquery.indexOf(value.contact.last_name) !== -1).length).to.equal(result.length);
          done();
        })
        .catch(done);
    });
    it('Should be able to handle queries on docid', done => {
      let values = 'World,Foobar,Fizzbuzz';
      Adapter.search({ values, docid: 'contact.last_name' })
        .try(result => {
          expect(result).to.be.an('array');
          let splitvalue = values.split(',');
          expect(result.filter(value => splitvalue.indexOf(value.contact.last_name) !== -1).length).to.equal(result.length);
          done();
        })
        .catch(done);
    });
    it('Should be able to handle composed queries', done => {
      let query = {
        'contact.first_name': { $regex: /^hello/i }
      };
      let values = 'Foobar,Fizzbuzz';
      Adapter.search({ query, values, docid: 'contact.last_name', inclusive: true })
        .try(result => {
          expect(result).to.be.an('array');
          let splitvalue = values.split(',');
          expect(result.filter(value => splitvalue.indexOf(value.contact.last_name) === -1).length).to.equal(result.length);
          done();
        })
        .catch(done);
    });
    it('Should be able to handle pagination', done => {
      let query = {
        'contact.first_name': { $regex: /^hello/i }
      };
      let values = 'Foobar,Fizzbuzz';
      Adapter.search({ query, values, docid: 'contact.last_name', inclusive: true, paginate: true, pagelength: 2, limit: 5 })
        .try(result => {
          expect(result).to.be.an('object');
          result = Object.keys(result).filter(key => {
            return (result[key].documents && result[key].count);
          });
          expect(result.length).to.equal(3);
          done();
        })
        .catch(done);
    });
  });
  describe('Adapter .load method testing', () => {
    let example;
    before(done => {
      Adapter.query({ limit: 1 })
        .then(result => {
          example = result[0];
          done();
        }, done);
    });
    it('Should be able to handle queries on docid', done => {
      Adapter.load({ docid: 'contact.last_name', query: 'Buzz' })
        .try(result => {
          expect(result).to.be.an('object');
          expect(result).to.have.property('contact');
          expect(result.contact.last_name).to.equal('Buzz');
          //expect(result.toObject()).to.have.property('createdat');
          done();
        })
        .catch(done);
    });
    it('Should be able to handle queries on _id if docid option is not passed', done => {
      Adapter.load({ query: example._id })
        .try(result => {
          expect(result).to.be.an('object');
          expect(result).to.have.property('contact');
          //expect(result.toObject()).to.have.property('createdat');
          done();
        })
        .catch(done);
    });
    it('Should query on _id even if docid is passed if value query is a valid id', done => {
      Adapter.load({ docid: 'contact.last_name', query: example._id })
        .try(result => {
          expect(result).to.be.an('object');
          expect(result).to.have.property('contact');
          //expect(result.toObject()).to.have.property('createdat');
          done();
        })
        .catch(done);
    });
  });
  describe('Adapter .stream method testing', () => {
    it('Should be return a loki stream of data', done => {
      Adapter.stream()
        .try(cursor => {
          expect(cursor).to.have.property('pause');
          expect(cursor).to.have.property('resume');
          let values = [];
          cursor.on('data', data => values.push(data))
            .on('end', () => {
              expect(values.filter(value => value._id).length).to.equal(values.length);
              done();
            })
            .on('error', done);
        })
        .catch(done);
    });
    it('Should respect custom configuration options', done => {
      Adapter.stream({ limit: 2 })
        .try(cursor => {
          expect(cursor).to.have.property('pause');
          expect(cursor).to.have.property('resume');
          let values = [];
          cursor.on('data', data => values.push(data))
            .on('end', () => {
              expect(values.length).to.equal(2);
              done();
            })
            .on('error', done);
        })
        .catch(done);
    });
  });
  describe('Adapter .delete method testing', () => {
    let example;
    let example1id;
    let example2id;
    before(done => {
      Adapter.query({ limit: 2 })
        .then(result => {
          example = result;
          done();
        }, done);
    });
    it('Should be able to handle delete', done => {
      Adapter.delete({ deleteid: example[0]._id })
        .try(result => Adapter.load({ query: { _id: example[0]._id } }))
        .try(result => {
          expect(result).to.not.be.ok;
          done();
        })
        .catch(done);
    });
    it('Should handle delete and return loaded object if return_deleted option is passed', done => {
      Adapter.delete({ deleteid: example[1]._id, return_deleted: true })
        .try(result => {
          expect(result).to.deep.equal(example[1]);
          return Adapter.load({ query: { _id: example[1]._id } });
        })
        .try(result => {
          expect(result).to.not.be.ok;
          done();
        })
        .catch(done);
    });
  });
  describe('Adapter .update method testing', function () {
    this.timeout(5000);
    let example;
    before(done => {
      Adapter.query({ limit: 1 })
        .then(result => {
          example = result[0];
          done();
        }, done);
    });
    it('Should be able to handle put updates', done => {
      let updatedoc = Object.assign({}, example);
      updatedoc.contact.first_name = 'Hi';
      Adapter.update({ id: updatedoc._id, originalrevision: example, updatedoc })
        .try(result => {
          expect(result).to.be.an('object');
          expect(result).to.not.have.property('contact');
          return Promisie.retry(() => {
            return Adapter.changeset.query({ 'parent_document.id': updatedoc._id })
              .then(result => {
                if (!result.length) return Promise.reject(new Error('Not Found'));
                else return Promise.resolve(result);
              }, e => Promise.reject(e));
          }, { times: 3, timeout: 500 });
        })
        .try(result => {
          expect(Array.isArray(result)).to.be.true;
          expect(result.length).to.equal(1);
          done();
        })
        .catch(done);
    });
    it('Should return updated document if return_updated is true', done => {
      let updatedoc = Object.assign({}, example);
      updatedoc.contact.first_name = 'Bob';
      Adapter.update({ id: updatedoc._id, originalrevision: example, updatedoc, return_updated: true })
        .try(result => {
          expect(result).to.be.an('object');
          expect(result.contact.first_name).to.equal('Bob');
          return Promisie.retry(() => {
            return Adapter.changeset.query({ 'parent_document.id': updatedoc._id })
              .then(result => {
                if (!result.length) return Promise.reject(new Error('Not Found'));
                else return Promise.resolve(result);
              }, e => Promise.reject(e));
          }, { times: 3, timeout: 500 });
        })
        .try(result => {
          expect(Array.isArray(result)).to.be.true;
          expect(result.length).to.equal(2);
          done();
        })
        .catch(done);
    });
    it('Should be able to handle patch updates', done => {
      let updatedoc = {
        contact: {
          last_name: 'Greg'
        }
      };
      Adapter.update({ id: example._id, originalrevision: example, updatedoc, isPatch: true })
        .then(() => Adapter.load({ query: { _id: example._id } }))
        .try(result => {
          expect(result.contact.last_name).to.equal('Greg');
          return Promisie.retry(() => {
            return Adapter.changeset.query({ 'parent_document.id': example._id })
              .then(result => {
                if (result.length < 3) return Promise.reject(new Error('Not Found'));
                else return Promise.resolve(result);
              }, e => Promise.reject(e));
          }, { times: 3, timeout: 500 });
        })
        .try(result => {
          expect(Array.isArray(result)).to.be.true;
          expect(result.length).to.equal(3);
          done();
        })
        .catch(done);
    });
    it('Should wait for changeset to save if ensure_changes is true', done => {
      let updatedoc = {
        contact: {
          last_name: 'Nick'
        }
      };
      Adapter.update({ id: example._id, originalrevision: example, updatedoc, isPatch: true, ensure_changes: true })
        .try(result => {
          expect(result).to.have.property('changes');
          expect(result).to.have.property('update');
          done();
        })
        .catch(done);
    });
    it('Should not track changes if track_changes is false', done => {
      let updatedoc = Object.assign({}, example);
      updatedoc.contact.first_name = 'Bob';
      Adapter.update({ id: updatedoc._id, originalrevision: example, updatedoc, track_changes: false })
        .try(result => {
          expect(result).to.be.an('object');
          expect(result).to.not.have.property('createdat');
          return Promisie.retry(() => {
            return Adapter.changeset.query({ 'parent_document.id': updatedoc._id })
              .then(result => {
                if (!result.length) return Promise.reject(new Error('Not Found'));
                else return Promise.resolve(result);
              }, e => Promise.reject(e));
          }, { times: 3, timeout: 500 });
        })
        .try(result => {
          expect(Array.isArray(result)).to.be.true;
          expect(result.length).to.equal(4);
          done();
        })
        .catch(done);
    });
    it('Should update multiple documents if multi option is true', done => {
      Adapter.update({ 
        query: {},
        multi: true,
        updateattributes: { 'contact.first_name': 'SameFirstName' }
      })
        .then(Adapter.query.bind(Adapter))
        .try(result => {
          expect(result).to.be.an('array');
          expect(result.filter(doc => doc.contact.first_name === 'SameFirstName').length).to.equal(result.length);
          done();
        })
        .catch(done);
    });
    it('Should generate patch and update multiple document is updatedoc is set and updateattributes is not', done => {
      Adapter.update({ 
        query: {},
        multi: true,
        updatedoc: {
          contact: {
            first_name: 'AnotherSameFirstName'
          }
        }
      })
        .then(Adapter.query.bind(Adapter))
        .try(result => {
          expect(result).to.be.an('array');
          expect(result.filter(doc => doc.contact.first_name === 'AnotherSameFirstName').length).to.equal(result.length);
          done();
        })
        .catch(done);
    });
    it('Should throw an error if neither updateattributes nor updatedoc is set', done => {
      Adapter.update({ multi: true })
        .then(() => {
          done(new Error('Should not execute'));
        }, e => {
          expect(e instanceof Error).to.be.true;
          expect(e.message).to.equal('Either updateattributes or updatedoc option must be set in order to execute multi update');
          done();
        });
    });
  });
});

