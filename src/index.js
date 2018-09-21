import { equals, curryN, F } from 'ramda';

export const runUntil = curryN(2,
  function(condition, iterator, mocks = []) {
    const yieldedValues = [];
    let result = iterator.next();
    while (!result.done) {
      yieldedValues.push(result.value);
      if (condition(result.value, yieldedValues.length)) {
        break;
      }

      const mock = mocks.find(m => m.match(result.value, yieldedValues.length));
      if (mock) {
        mock.action(iterator, yieldedValues.length);
      } else {
        iterator.next();
      }
    }
    return yieldedValues;
  }
)

export const runUntilCompletion = runUntil(F);

//TODO: add optional second parameter which is a function, so you can do more complicated logic.
// eg: 
//   when(put('whatever'), ({value, count, next, throw, return}) => {
//     if (value === something) {
//       next('something else')
//     } else {
//       throw('err');
//     }
//   })
export const when = function (valueOrMatcher) {
  let matcher;
  if (typeof valueOrMatcher === 'function') {
    matcher = valueOrMatcher;
  } else {
    matcher = equals(valueOrMatcher)
  }

  const actions = [];

  const mock = {
    match: (val, count) => matcher(val, count) && actions.length > 0,
    action: (iterator, count) => {
      const action = actions.shift();
      if (action) {
        action(iterator, count);
      }
    },
    next: function (mockValue) {
      actions.push(iterator => iterator.next(mockValue));
      return this;
    },
    throw: function (mockValue) {
      actions.push(iterator => iterator.throw && iterator.throw(mockValue));
      return this;
    },
    return: function (mockValue) {
      actions.push(iterator => iterator.return && iterator.return(mockValue));
      return this;
    },
  }

  return mock;
}

//TODO: add a whenever which will match as many times as it occurs