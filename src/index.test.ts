import { when, whenever, run } from ".";

describe('run', () => {
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
        run(1 as any, [], { silent: true });
        expect(false).toEqual(true);
      } catch (ex) {}
    })
  
    it('throws if passed a non iterator/generator (non-iterator object)', () => {
      try {
        run({ then: jest.fn() } as any, [], { silent: true });
        expect(false).toEqual(true);
      } catch (ex) {}
    })
  
    it('throws if passed a non iterator/generator (normal function)', () => {
      const fn = jest.fn();
      try {
        run(fn as any, [], { silent: true });
        expect(false).toEqual(true);
      } catch (ex) {
        expect(fn).toHaveBeenCalled();
      }
    })
  
    it('runs to completion, no mocks', () => {
      const results = run(sampleSaga());
      expect(results).toEqual(['one', 'undefinedsuccess', 'finally']);
    })
  
    it('runs to completion, passed in generator instead of iterator', () => {
      const results = run(sampleSaga);
      expect(results).toEqual(['one', 'undefinedsuccess', 'finally']);
    })
  
    it('runs to completion, passed in mock next', () => {
      const mocks = [when('one').next('fake')];
      const results = run(sampleSaga(), mocks);
      expect(results).toEqual(['one', 'fakesuccess', 'finally']);
    })
  
    it('runs to completion, passed in mock throw', () => {
      const mocks = [when('one').throw('fake')];
      const results = run(sampleSaga(), mocks);
      expect(results).toEqual(['one', 'fakeerr', 'finally']);
    })
  
    it('runs to completion, passed in mock return', () => {
      const mocks = [when('one').return()];
      const results = run(sampleSaga(), mocks);
      expect(results).toEqual(['one', 'finally']);
    })
  
    it('runs to completion, passed in mock respond', () => {
      const mocks = [when('one').respond(iterator => iterator.next('fake'))];
      const results = run(sampleSaga(), mocks);
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

      const results = run(sampleSaga, mocks);
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
      const results = run(sampleSaga, mocks);
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
      const results = run(sampleSaga, mocks);
      expect(results).toEqual(['get', 'get', 'oneone']);
    })
  })

  test('throws after 1000 yields', () => {
    function* infiniteSaga (){
      while(true) {
        yield 'hi';
      }
    }

    let count = 0;
    try {
      const mocks = [
        whenever(() => {
          count++;
          return undefined;
        }).next(undefined)
      ];
      run(infiniteSaga, mocks, { silent: true });
      expect(false).toEqual(true);
    } catch {
      expect(count).toEqual(1000);
    }
  });
})

describe('when', () => {
  it('exists', () => {
    expect(when).toBeDefined();
  });

  const createTests = (key: 'next' | 'throw' | 'return') => {
    describe(`when.${key}`, () => {
      it('notices a match (primitive)', () => {
        const matcher = when(3)[key]('result');

        expect(matcher._match(3, [])).toEqual(true);
      })

      it('notices a match (object reference)', () => {
        const input = { hello: 'world' };
        const matcher = when(input)[key]('result');

        expect(matcher._match(input, [])).toEqual(true);
      })

      it('notices a match (object shape)', () => {
        const input = { hello: 'world' };
        const similar = { hello: 'world' };
        const matcher = when(input)[key]('result');

        expect(matcher._match(similar, [])).toEqual(true);
      })

      it('notices a match (custom matcher)', () => {
        const matchFxn = jest.fn().mockReturnValue(true);
        const matcher = when(matchFxn)[key]('result');
        const sample = {};
        const mockValuesSoFar: any[] = [];
        const match = matcher._match(sample, mockValuesSoFar);

        expect(match).toEqual(true);
        expect(matchFxn).toHaveBeenCalledWith(sample, mockValuesSoFar);
      })
      
      it('notices a mismatch (primitive)', () => {
        const matcher = when(3)[key]('result');

        expect(matcher._match(4, [])).toEqual(false);
      })

      it('notices a mismatch (object shape)', () => {
        const input = { hello: 'world' };
        const notSimilar = { greetings: 'universe' };
        const matcher = when(input)[key]('result');

        expect(matcher._match(notSimilar, [])).toEqual(false);
      })

      it('notices a mismatch (custom matcher)', () => {
        const matchFxn = jest.fn().mockReturnValue(false);
        const matcher = when(matchFxn)[key]('result');
        const sample = {};
        const mockValuesSoFar: any[] = [];
        const match = matcher._match(sample, mockValuesSoFar);

        expect(match).toEqual(false);
        expect(matchFxn).toHaveBeenCalledWith(sample, mockValuesSoFar);
      })

      it('supports execute', () => {
        const matcher = when(1)[key]('result');
        const mockIterator = {
          next: jest.fn().mockReturnValue('iteratorResult'),
          throw: jest.fn().mockReturnValue('iteratorResult'),
          return: jest.fn().mockReturnValue('iteratorResult'),
        };

        const output = matcher._execute(mockIterator);
        expect(mockIterator[key]).toHaveBeenCalledWith('result');
        expect(output).toEqual('iteratorResult');
      })

      it('notices a match only the first time', () => {
        const matcher = when(1)[key]('result');
        matcher._execute({ 
          next: jest.fn(),
          throw: jest.fn(),
          return: jest.fn(),
        });
        
        expect(matcher._match(1, [])).toEqual(false);
      })
    });
  }
  
  createTests('next');
  createTests('throw');
  createTests('return');

  describe('when.respond', () => {
    it('should execute with the iterator', () => {
      const mockIterator = {
        next: jest.fn(),
        return: jest.fn(),
        throw: jest.fn()
      };
      const callback = jest.fn();
      const matcher = when(1).respond(callback);
      
      matcher._execute(mockIterator);
      expect(callback).toHaveBeenCalledWith(mockIterator);
    })
  })
});

describe('whenever', () => {

});