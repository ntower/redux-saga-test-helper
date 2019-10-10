import equals from 'ramda/src/equals';
import curryN from 'ramda/src/curryN';

type Responder = <T>(iterator: Iterator<T>) => IteratorResult<T> | undefined;

interface Mock {
  match: (value: any, allValues: any[]) => boolean;
  execute: (iterator: Iterator<any>) => any;
  next: (value?: any) => this;
  throw: (value?: any) => this;
  return: (value?: any) => this;
  then: (callback: Responder) => this;
}

export const runUntil = curryN(2,
  function(condition, iteratorOrGenerator, mocks: Mock[] = []) {
    const iterator = typeof iteratorOrGenerator === 'function' ? iteratorOrGenerator() : iteratorOrGenerator;
    if (!iterator || !iterator.next) {
      throw new Error('Requires an iterator or generator to work');
    }

    const yieldedValues: any[] = [];
    let result = iterator.next();
    while (!result.done) {
      yieldedValues.push(result.value);
      if (condition(result.value, yieldedValues)) {
        break;
      }

      const match = mocks.find(m => m.match(result.value, yieldedValues));
      if (match) {
        // TODO: handle if execute doesn't return an object. This should
        //   only happen with custom code via .then, but still should 
        //   support it.
        result = match.execute(iterator);
      } else {
        result = iterator.next();
      }
    }
    return yieldedValues;
  }
)

export const runUntilCompletion = runUntil(() => false);

type ActionPicker = (actions: Responder[]) => Responder;

function createMock(actionPicker: ActionPicker, valueOrMatcher: any): Mock {
  let matcher: (value: any, allValues: any) => boolean;
  if (typeof valueOrMatcher === 'function') {
    matcher = valueOrMatcher;
  } else {
    matcher = equals(valueOrMatcher)
  }

  const responders: Responder[] = [];

  const mock: Mock = {
    match: (val, allValues) => responders.length > 0 && matcher(val, allValues),
    execute: (iterator) => {
      const action = actionPicker(responders);
      if (action) {
        return action(iterator);
      }
      return undefined;
    },
    then: function (callback: Responder) {
      responders.push(callback);
      return this;
    },
    next: function (mockValue) {
      return this.then(iterator => iterator && iterator.next && iterator.next(mockValue));
    },
    throw: function (mockValue) {
      return this.then(iterator => iterator && iterator.throw && iterator.throw(mockValue));
    },
    return: function (mockValue) {
      return this.then(iterator => iterator && iterator.return && iterator.return(mockValue));
    },
  }

  return mock;
}

export const when = (valueOrMatcher: any) => createMock((responders: Responder[]) => responders.shift()!, valueOrMatcher);

export const whenever = (valueOrMatcher: any) => createMock((responders: Responder[]) => responders[0], valueOrMatcher);