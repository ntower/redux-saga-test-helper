import { equals, curryN, F, head } from 'ramda';

export const runUntil = curryN(2,
  function(condition, iteratorOrGenerator, matchers = []) {
    let iterator = typeof iteratorOrGenerator === 'function' ? iteratorOrGenerator() : iteratorOrGenerator;
    if (!iterator || !iterator.next) {
      throw new Error('Requires an iterator or generator to work');
    }

    const yieldedValues = [];
    let result = iterator.next();
    while (!result.done) {
      yieldedValues.push(result.value);
      if (condition(result.value, yieldedValues)) {
        break;
      }

      const match = matchers.find(m => m.match(result.value, yieldedValues));
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

export const runUntilCompletion = runUntil(F);

const createMock = curryN(2, function(actionPicker, valueOrMatcher) {
  let matcher;
  if (typeof valueOrMatcher === 'function') {
    matcher = valueOrMatcher;
  } else {
    matcher = equals(valueOrMatcher)
  }

  const actions = [];

  const mock = {
    match: (val, allValues) => actions.length > 0 && matcher(val, allValues),
    execute: (iterator) => {
      const action = actionPicker(actions);
      if (action) {
        return action(iterator);
      }
    },
    then: function (callback) {
      actions.push(callback);
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
});

export const when = createMock(actions => actions.shift())

export const whenever = createMock(head);