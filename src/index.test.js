import { when, whenever, runUntilCompletion } from ".";

describe('runUntilCompletion', () => {
  describe('0 or 1 mock', () => {
    function* sampleSaga() {
      try {
        const one = yield 'one';
        yield one + 'success';
      } catch (ex) {
        yield ex + 'err';
      } finally {
        yield 'finally';
      }
    }
  
    it('throws if passed a non iterator/generator (primitive)', () => {
      try {
        const results = runUntilCompletion(1);
        expect(false).toEqual(true);
      } catch (ex) {}
    })
  
    it('throws if passed a non iterator/generator (non-iterator object)', () => {
      try {
        const results = runUntilCompletion({ then: jest.fn() });
        expect(false).toEqual(true);
      } catch (ex) {}
    })
  
    it('throws if passed a non iterator/generator (normal function)', () => {
      const fn = jest.fn();
      try {
        const results = runUntilCompletion(fn);
        expect(false).toEqual(true);
      } catch (ex) {
        expect(fn).toHaveBeenCalled();
      }
    })
  
    it('runs to completion, no mocks', () => {
      const results = runUntilCompletion(sampleSaga());
      expect(results).toEqual(['one', 'undefinedsuccess', 'finally']);
    })
  
    it('runs to completion, passed in generator instead of iterator', () => {
      const results = runUntilCompletion(sampleSaga);
      expect(results).toEqual(['one', 'undefinedsuccess', 'finally']);
    })
  
    it('runs to completion, passed in mock next', () => {
      const mocks = [when('one').next('fake')];
      const results = runUntilCompletion(sampleSaga(), mocks);
      expect(results).toEqual(['one', 'fakesuccess', 'finally']);
    })
  
    it('runs to completion, passed in mock throw', () => {
      const mocks = [when('one').throw('fake')];
      const results = runUntilCompletion(sampleSaga(), mocks);
      expect(results).toEqual(['one', 'fakeerr', 'finally']);
    })
  
    it('runs to completion, passed in mock return', () => {
      const mocks = [when('one').return()];
      const results = runUntilCompletion(sampleSaga(), mocks);
      expect(results).toEqual(['one', 'finally']);
    })
  
    it('runs to completion, passed in mock then', () => {
      const mocks = [when('one').then(iterator => iterator.next('fake'))];
      const results = runUntilCompletion(sampleSaga(), mocks);
      expect(results).toEqual(['one', 'fakesuccess', 'finally']);
    })
  })

  describe('2+ mocks', () => {
    it('does not care about order', () => {
      function* sampleSaga() {
        const one = yield 'getone';
        const two = yield 'gettwo';
        yield one + two;
      }

      const mocks = [
        when('gettwo').next('two'),
        when('getone').next('one')
      ]

      const results = runUntilCompletion(sampleSaga, mocks);
      expect(results).toEqual(['getone', 'gettwo', 'onetwo']);
    })

    it('chained whens', () => {
      function* sampleSaga() {
        const one = yield 'get';
        const two = yield 'get';
        yield one + two;
      }

      const mocks = [
        when('get').next('one').next('two')
      ]
      const results = runUntilCompletion(sampleSaga, mocks);
      expect(results).toEqual(['get', 'get', 'onetwo']);
    })

    it('whenever', () => {
      function* sampleSaga() {
        const one = yield 'get';
        const two = yield 'get';
        yield one + two;
      }

      const mocks = [
        whenever('get').next('one')
      ]
      const results = runUntilCompletion(sampleSaga, mocks);
      expect(results).toEqual(['get', 'get', 'oneone']);
    })
  })
})

describe('when', () => {
  it('exists', () => {
    expect(when).toBeDefined();
  });

  const createTests = (key) => {
    describe(`when.${key}`, () => {
      it('notices a match (primitive)', () => {
        const matcher = when(3)[key]('result');

        expect(matcher.match(3)).toEqual(true);
      })

      it('notices a match (object reference)', () => {
        const input = { hello: 'world' };
        const matcher = when(input)[key]('result');

        expect(matcher.match(input)).toEqual(true);
      })

      it('notices a match (object shape)', () => {
        const input = { hello: 'world' };
        const similar = { hello: 'world' };
        const matcher = when(input)[key]('result');

        expect(matcher.match(similar)).toEqual(true);
      })

      it('notices a match (custom matcher)', () => {
        const matchFxn = jest.fn().mockReturnValue(true);
        const matcher = when(matchFxn)[key]('result');
        const sample = {};
        const mockValuesSoFar = [];
        const match = matcher.match(sample, mockValuesSoFar);

        expect(match).toEqual(true);
        expect(matchFxn).toHaveBeenCalledWith(sample, mockValuesSoFar);
      })
      
      it('notices a mismatch (primitive)', () => {
        const matcher = when(3)[key]('result');

        expect(matcher.match(4)).toEqual(false);
      })

      it('notices a mismatch (object shape)', () => {
        const input = { hello: 'world' };
        const notSimilar = { greetings: 'universe' };
        const matcher = when(input)[key]('result');

        expect(matcher.match(notSimilar)).toEqual(false);
      })

      it('notices a mismatch (custom matcher)', () => {
        const matchFxn = jest.fn().mockReturnValue(false);
        const matcher = when(matchFxn)[key]('result');
        const sample = {};
        const mockValuesSoFar = [];
        const match = matcher.match(sample, mockValuesSoFar);

        expect(match).toEqual(false);
        expect(matchFxn).toHaveBeenCalledWith(sample, mockValuesSoFar);
      })

      it('supports execute', () => {
        const matcher = when(1)[key]('result');
        const mockIterator = {[key]: jest.fn()};
        matcher.execute(mockIterator);

        expect(mockIterator[key]).toHaveBeenCalledWith('result');
      })

      it('notices a match only the first time', () => {
        const matcher = when(1)[key]('result');
        matcher.execute({ [key]: jest.fn() });
        
        expect(matcher.match(1)).toEqual(false);
      })
    });
  }
  
  createTests('next');
  createTests('throw');
  createTests('return');

  describe('when.then', () => {
    it('should execute with the iterator', () => {
      const mockIterator = {
        next: jest.fn(),
        return: jest.fn(),
        throw: jest.fn()
      };
      const callback = jest.fn();
      const matcher = when(1).then(callback);
      
      matcher.execute(mockIterator);
      expect(callback).toHaveBeenCalledWith(mockIterator);
    })
  })
});

describe('whenever', () => {

});