import { when } from ".";

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
        const match = matcher.match(sample, 1000);

        expect(match).toEqual(true);
        expect(matchFxn).toHaveBeenCalledWith(sample, 1000);
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
        const match = matcher.match(sample, 1000);

        expect(match).toEqual(false);
        expect(matchFxn).toHaveBeenCalledWith(sample, 1000);
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