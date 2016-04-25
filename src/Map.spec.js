/* global createUsers, databases, compareAllUsers, getRandomNumber, applyRandomTransactionsNoGCNoDisconnect, applyRandomTransactionsAllRejoinNoGC, applyRandomTransactionsWithGC, async, describeManyTimes */
/* eslint-env browser,jasmine */
'use strict'

var Y = require('../../yjs/src/SpecHelper.js')
var numberOfYMapTests = 500
var repeatMapTeasts = 200

function compareEvent (is, should) {
  for (var key in should) {
    expect(should[key]).toEqual(is[key])
  }
}

for (let database of databases) {
  describe(`Map Type (DB: ${database})`, function () {
    var y1, y2, y3, y4, flushAll

    beforeEach(async(function * (done) {
      yield createUsers(this, 5, database)
      y1 = this.users[0].share.root
      y2 = this.users[1].share.root
      y3 = this.users[2].share.root
      y4 = this.users[3].share.root
      flushAll = Y.utils.globalRoom.flushAll
      done()
    }))
    afterEach(async(function * (done) {
      yield compareAllUsers(this.users)
      done()
    }), 5000)

    describe('Basic tests', function () {
      it('Basic get&set of Map property (converge via sync)', async(function * (done) {
        y1.set('stuff', 'stuffy')
        expect(y1.get('stuff')).toEqual('stuffy')
        yield flushAll()
        for (var key in this.users) {
          var u = this.users[key].share.root
          expect(u.get('stuff')).toEqual('stuffy')
        }
        done()
      }))
      it('Map can set custom types (Map)', async(function * (done) {
        var map = yield y1.set('Map', Y.Map)
        map.set('one', 1)
        map = yield y1.get('Map')
        expect(map.get('one')).toEqual(1)
        done()
      }))
      it('Map can set custom types (Array)', async(function * (done) {
        var array = yield y1.set('Array', Y.Array)
        array.insert(0, [1, 2, 3])
        array = yield y1.get('Array')
        expect(array.toArray()).toEqual([1, 2, 3])
        done()
      }))
      it('Basic get&set of Map property (converge via update)', async(function * (done) {
        yield flushAll()
        y1.set('stuff', 'stuffy')
        expect(y1.get('stuff')).toEqual('stuffy')

        yield flushAll()
        for (var key in this.users) {
          var r = this.users[key].share.root
          expect(r.get('stuff')).toEqual('stuffy')
        }
        done()
      }))
      it('Basic get&set of Map property (handle conflict)', async(function * (done) {
        yield flushAll()
        y1.set('stuff', 'c0')
        y2.set('stuff', 'c1')

        yield flushAll()
        for (var key in this.users) {
          var u = this.users[key]
          expect(u.share.root.get('stuff')).toEqual('c0')
        }
        done()
      }))
      it('Basic get&set&delete of Map property (handle conflict)', async(function * (done) {
        yield flushAll()
        y1.set('stuff', 'c0')
        y1.delete('stuff')
        y2.set('stuff', 'c1')
        yield flushAll()

        for (var key in this.users) {
          var u = this.users[key]
          expect(u.share.root.get('stuff')).toBeUndefined()
        }
        done()
      }))
      it('Basic get&set of Map property (handle three conflicts)', async(function * (done) {
        yield flushAll()
        y1.set('stuff', 'c0')
        y2.set('stuff', 'c1')
        y2.set('stuff', 'c2')
        y3.set('stuff', 'c3')
        yield flushAll()

        for (var key in this.users) {
          var u = this.users[key]
          expect(u.share.root.get('stuff')).toEqual('c0')
        }
        done()
      }))
      it('Basic get&set&delete of Map property (handle three conflicts)', async(function * (done) {
        yield flushAll()
        y1.set('stuff', 'c0')
        y2.set('stuff', 'c1')
        y2.set('stuff', 'c2')
        y3.set('stuff', 'c3')
        yield flushAll()
        y1.set('stuff', 'deleteme')
        y1.delete('stuff')
        y2.set('stuff', 'c1')
        y3.set('stuff', 'c2')
        y4.set('stuff', 'c3')
        yield flushAll()

        for (var key in this.users) {
          var u = this.users[key]
          expect(u.share.root.get('stuff')).toBeUndefined()
        }
        done()
      }))
      it('observePath properties', async(function * (done) {
        y1.observePath(['map'], function (map) {
          if (map != null) {
            map.set('yay', 4)
          }
        })
        yield y2.set('map', Y.Map)
        yield flushAll()
        var map = yield y3.get('map')
        expect(map.get('yay')).toEqual(4)
        done()
      }))
      it('observe deep properties', async(function * (done) {
        var map1 = yield y1.set('map', Y.Map)
        var calls = 0
        var dmapid
        map1.observe(function (event) {
          calls++
          expect(event.name).toEqual('deepmap')
          dmapid = event.object.opContents.deepmap
        })
        yield flushAll()
        var map3 = yield y3.get('map')
        yield map3.set('deepmap', Y.Map)
        yield flushAll()
        var map2 = yield y2.get('map')
        yield map2.set('deepmap', Y.Map)
        yield flushAll()
        var dmap1 = yield map1.get('deepmap')
        var dmap2 = yield map2.get('deepmap')
        var dmap3 = yield map3.get('deepmap')
        expect(calls > 0).toBeTruthy()
        expect(dmap1._model).toEqual(dmap2._model)
        expect(dmap1._model).toEqual(dmap3._model)
        expect(dmap1._model).toEqual(dmapid)
        done()
      }))
      it('throws add & update & delete events (with type and primitive content)', async(function * (done) {
        var event
        yield flushAll()
        y1.observe(function (e) {
          event = e // just put it on event, should be thrown synchronously anyway
        })
        y1.set('stuff', 4)
        compareEvent(event, {
          type: 'add',
          object: y1,
          name: 'stuff'
        })
        // update, oldValue is in contents
        yield y1.set('stuff', Y.Array)
        compareEvent(event, {
          type: 'update',
          object: y1,
          name: 'stuff',
          oldValue: 4
        })

        y1.get('stuff').then(function (replacedArray) {
          // update, oldValue is in opContents
          y1.set('stuff', 5)
          var getYArray = event.oldValue
          expect(typeof getYArray.constructor === 'function').toBeTruthy()
          getYArray().then(function (array) {
            expect(array).toEqual(replacedArray)

            // delete
            y1.delete('stuff')
            compareEvent(event, {
              type: 'delete',
              name: 'stuff',
              object: y1,
              oldValue: 5
            })
            done()
          })
        })
      }))
    })
    describeManyTimes(repeatMapTeasts, `${numberOfYMapTests} Random tests`, function () {
      var randomMapTransactions = [
        function set (map) {
          map.set('somekey', getRandomNumber())
        },
        function setType (map) {
          map.set('somekey', Y.Array).then(function (array) {
            array.insert(0, [1, 2, 3, 4])
          })
        },
        function delete_ (map) {
          map.delete('somekey')
        }
      ]
      function compareMapValues (maps) {
        var firstMap
        for (var map of maps) {
          var val = map.getPrimitive()
          if (firstMap == null) {
            firstMap = val
          } else {
            expect(val).toEqual(firstMap)
          }
        }
      }
      beforeEach(async(function * (done) {
        yield y1.set('Map', Y.Map)
        yield flushAll()

        var promises = []
        for (var u = 0; u < this.users.length; u++) {
          promises.push(this.users[u].share.root.get('Map'))
        }
        this.maps = yield Promise.all(promises)
        done()
      }))
      it(`succeed after ${numberOfYMapTests} actions, no GC, no disconnect`, async(function * (done) {
        yield applyRandomTransactionsNoGCNoDisconnect(this.users, this.maps, randomMapTransactions, numberOfYMapTests)
        yield flushAll()
        yield compareMapValues(this.maps)
        done()
      }))
      it(`succeed after ${numberOfYMapTests} actions, no GC, all users disconnecting/reconnecting`, async(function * (done) {
        yield applyRandomTransactionsAllRejoinNoGC(this.users, this.maps, randomMapTransactions, numberOfYMapTests)
        yield flushAll()
        yield compareMapValues(this.maps)
        done()
      }))
      it(`succeed after ${numberOfYMapTests} actions, GC, user[0] is not disconnecting`, async(function * (done) {
        yield applyRandomTransactionsWithGC(this.users, this.maps, randomMapTransactions, numberOfYMapTests)
        yield flushAll()
        yield compareMapValues(this.maps)
        done()
      }))
    })
  })
}
